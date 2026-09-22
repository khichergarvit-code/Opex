import { describe, expect, it, vi } from 'vitest';
import { route } from './router.js';
import type { AuthedUser } from '../policy/types.js';

function user(): AuthedUser {
  return { id: 'u1', email: 'u@opex.local', role: 'employee', clearance: 1, status: 'active' };
}

describe('route() — rule pre-checks', () => {
  it('routes an image attachment to vision without calling the model', async () => {
    const chat = vi.fn();
    const decision = await route({
      message: 'what is this?',
      attachments: [{ filename: 'photo.png', mime: 'image/png' }],
      hasReadyDocuments: false,
      gateway: { chat } as never,
      user: user(),
      traceId: 't1',
    });
    expect(decision.agent).toBe('vision');
    expect(decision.taskType).toBe('vision');
    expect(chat).not.toHaveBeenCalled();
  });

  it('routes a CSV attachment to analysis', async () => {
    const chat = vi.fn();
    const decision = await route({
      message: 'analyze this',
      attachments: [{ filename: 'data.csv', mime: 'text/csv' }],
      hasReadyDocuments: false,
      gateway: { chat } as never,
      user: user(),
      traceId: 't1',
    });
    expect(decision.agent).toBe('analysis');
    expect(chat).not.toHaveBeenCalled();
  });

  it('/doc forces the doc_qa agent', async () => {
    const chat = vi.fn();
    const decision = await route({
      message: '/doc what is the torque spec?',
      attachments: [],
      hasReadyDocuments: false,
      gateway: { chat } as never,
      user: user(),
      traceId: 't1',
    });
    expect(decision.agent).toBe('doc_qa');
    expect(chat).not.toHaveBeenCalled();
  });

  it('/code forces analysis (no dedicated code agent until B3)', async () => {
    const chat = vi.fn();
    const decision = await route({
      message: '/code plot this',
      attachments: [],
      hasReadyDocuments: false,
      gateway: { chat } as never,
      user: user(),
      traceId: 't1',
    });
    expect(decision.agent).toBe('analysis');
    expect(chat).not.toHaveBeenCalled();
  });
});

describe('route() — llm-small JSON classification', () => {
  it('uses the model classification when it parses successfully', async () => {
    const chat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        task_type: 'chat',
        complexity: 'simple',
        agent: 'general',
        needs: { documents: false, memory: [], tools: [] },
        reason: 'a plain greeting',
      }),
      tokensIn: 1,
      tokensOut: 1,
    });
    const decision = await route({
      message: 'hello there',
      attachments: [],
      hasReadyDocuments: false,
      gateway: { chat } as never,
      user: user(),
      traceId: 't1',
    });
    expect(decision.agent).toBe('general');
    expect(decision.taskType).toBe('chat');
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('falls back to rules when the model returns unparseable JSON', async () => {
    const chat = vi.fn().mockResolvedValue({ content: 'not json at all', tokensIn: 1, tokensOut: 1 });
    const decision = await route({
      message: 'hello',
      attachments: [],
      hasReadyDocuments: false,
      gateway: { chat } as never,
      user: user(),
      traceId: 't1',
    });
    expect(decision.agent).toBe('general');
    expect(decision.reason).toMatch(/fallback/);
  });

  it('falls back to doc_qa when the project has ready documents and the model call fails', async () => {
    const chat = vi.fn().mockRejectedValue(new Error('model down'));
    const decision = await route({
      message: 'hello',
      attachments: [],
      hasReadyDocuments: true,
      gateway: { chat } as never,
      user: user(),
      traceId: 't1',
    });
    expect(decision.agent).toBe('doc_qa');
  });

  // Regression: found via a live eval run where llm-small (0.5B, easily
  // confused) returned agent:"agent" — echoing the JSON schema's own field
  // name instead of a real agent. conversations.ts branches on an exact
  // string match against 'doc_qa'/'vision'/'analysis', so an unvalidated
  // value here would silently fall through to plain chat even though
  // task_type correctly said 'doc_qa'. The Zod schema must reject it and
  // fall back to the rules instead of ever propagating a bogus agent name.
  it('falls back to rules when the model hallucinates an agent name outside the enum', async () => {
    const chat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        task_type: 'doc_qa',
        complexity: 'simple',
        agent: 'agent',
        needs: { documents: true, memory: [], tools: [] },
        reason: 'a document question',
      }),
      tokensIn: 1,
      tokensOut: 1,
    });
    const decision = await route({
      message: 'what is the torque spec?',
      attachments: [],
      hasReadyDocuments: true,
      gateway: { chat } as never,
      user: user(),
      traceId: 't1',
    });
    expect(decision.agent).toBe('doc_qa');
    expect(decision.reason).toMatch(/fallback/);
  });
});
