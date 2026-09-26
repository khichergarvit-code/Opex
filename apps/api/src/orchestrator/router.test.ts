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

  it('/code forces the code agent (B3)', async () => {
    const chat = vi.fn();
    const decision = await route({
      message: '/code plot this',
      attachments: [],
      hasReadyDocuments: false,
      gateway: { chat } as never,
      user: user(),
      traceId: 't1',
    });
    expect(decision.agent).toBe('code');
    expect(chat).not.toHaveBeenCalled();
  });
});

describe('route() — fast rules that skip the classifier', () => {
  const base = { attachments: [], gateway: { chat: undefined } as never, user: user(), traceId: 't1' };
  it.each(['hi', 'hello', 'thanks!', 'good morning'])('routes the greeting "%s" to chat without a model call', async (message) => {
    const chat = vi.fn();
    const d = await route({ ...base, gateway: { chat } as never, message, hasReadyDocuments: true });
    expect(d.agent).toBe('general');
    expect(chat).not.toHaveBeenCalled();
  });
  it('routes plain chat to general when there are no documents and no tool words', async () => {
    const chat = vi.fn();
    const d = await route({ ...base, gateway: { chat } as never, message: 'explain how a heat exchanger works', hasReadyDocuments: false });
    expect(d.agent).toBe('general');
    expect(chat).not.toHaveBeenCalled();
  });
  it('still classifies with the model when documents exist or tool words appear', async () => {
    const chat = vi.fn().mockRejectedValue(new Error('x'));
    await route({ ...base, gateway: { chat } as never, message: 'explain how a heat exchanger works', hasReadyDocuments: true });
    await route({ ...base, gateway: { chat } as never, message: 'create a file with the results', hasReadyDocuments: false });
    expect(chat).toHaveBeenCalledTimes(2);
  });
  it('does not call the model once the run was stopped', async () => {
    const chat = vi.fn();
    const ctl = new AbortController();
    ctl.abort();
    await route({ ...base, gateway: { chat } as never, message: 'flange bolt spec', hasReadyDocuments: true, signal: ctl.signal });
    expect(chat).not.toHaveBeenCalled();
  });
});

describe('route() — image requests', () => {
  const base = { attachments: [], user: user(), traceId: 't1', hasReadyDocuments: true };
  it.each(['draw a picture of a centrifugal pump', 'Generate an image of a wind turbine at sunset', 'please create a logo for my team', '/image a red valve', 'make me a poster about safety'])(
    'routes "%s" to the image agent without a model call',
    async (message) => {
      const chat = vi.fn();
      const d = await route({ ...base, gateway: { chat } as never, message });
      expect(d.agent).toBe('image');
      expect(d.taskType).toBe('image');
      expect(chat).not.toHaveBeenCalled();
    },
  );
  it('does not treat a question about documents as an image request', async () => {
    const chat = vi.fn().mockRejectedValue(new Error('x'));
    const d = await route({ ...base, gateway: { chat } as never, message: 'what does the drawing on page 3 show?' });
    expect(d.agent).not.toBe('image');
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
      message: 'analyze the pump downtime data',
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
      message: 'analyze this',
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
      message: 'flange bolt spec',
      attachments: [],
      hasReadyDocuments: true,
      gateway: { chat } as never,
      user: user(),
      traceId: 't1',
    });
    expect(decision.agent).toBe('doc_qa');
  });

  // Regression for a real eval finding (eval/results/2026-09-22.md): all
  // 9/32 router failures were plain-English document questions on a
  // project with ready documents, misclassified as "general" — the
  // system prompt never told the model documents existed. This asserts
  // the fix actually reaches the prompt, not just that hasReadyDocuments
  // is accepted as a parameter.
  it('tells the model documents are ready when hasReadyDocuments is true', async () => {
    const chat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        task_type: 'doc_qa',
        complexity: 'simple',
        agent: 'doc_qa',
        needs: { documents: true, memory: [], tools: ['doc_search'] },
        reason: 'a document question',
      }),
      tokensIn: 1,
      tokensOut: 1,
    });
    await route({
      message: 'what is the torque spec?',
      attachments: [],
      hasReadyDocuments: true,
      gateway: { chat } as never,
      user: user(),
      traceId: 't1',
    });
    const systemMessage = chat.mock.calls[0]![0].messages[0].content as string;
    expect(systemMessage).toMatch(/HAS ready ingested documents/);
  });

  it('tells the model there are no documents when hasReadyDocuments is false', async () => {
    const chat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        task_type: 'chat',
        complexity: 'simple',
        agent: 'general',
        needs: { documents: false, memory: [], tools: [] },
        reason: 'a greeting',
      }),
      tokensIn: 1,
      tokensOut: 1,
    });
    await route({
      message: 'analyze downtime',
      attachments: [],
      hasReadyDocuments: false,
      gateway: { chat } as never,
      user: user(),
      traceId: 't1',
    });
    const systemMessage = chat.mock.calls[0]![0].messages[0].content as string;
    expect(systemMessage).toMatch(/NO ready ingested documents/);
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
