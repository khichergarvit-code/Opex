import { describe, expect, it, vi } from 'vitest';
import { extractCandidates } from './extraction.js';
import type { AuthedUser } from '../policy/types.js';

function user(): AuthedUser {
  return { id: 'u1', email: 'u@opex.local', role: 'employee', clearance: 1, status: 'active' };
}

const run = (chat: ReturnType<typeof vi.fn>, text = 'i prefer nm over ft-lb') =>
  extractCandidates({ gateway: { chat } as never, user: user(), traceId: 't1' }, text);

const reply = (candidates: unknown[]) => vi.fn().mockResolvedValue({ content: JSON.stringify({ candidates }), tokensIn: 1, tokensOut: 1 });

describe('extractCandidates', () => {
  it('returns candidates that parse successfully', async () => {
    const out = await run(reply([{ text: 'The user prefers Nm over ft-lb.', type: 'semantic', scope: 'user', confidence: 0.9 }]));
    expect(out.failed).toBe(false);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]!.text).toBe('The user prefers Nm over ft-lb.');
  });

  it('reports failure (not "nothing to remember") when the model returns unparseable JSON', async () => {
    const out = await run(vi.fn().mockResolvedValue({ content: 'not json', tokensIn: 1, tokensOut: 1 }));
    expect(out).toEqual({ candidates: [], failed: true });
  });

  it('reports failure when the model call throws, so the conversation is retried', async () => {
    const out = await run(vi.fn().mockRejectedValue(new Error('model down')));
    expect(out).toEqual({ candidates: [], failed: true });
  });

  it('an empty result from a healthy model is not a failure', async () => {
    const out = await run(reply([]), 'who is the prime minister of india');
    expect(out).toEqual({ candidates: [], failed: false });
  });

  it('drops candidates below the 0.6 confidence threshold (memory.md step 3)', async () => {
    const out = await run(
      reply([
        { text: 'The user might like tea.', type: 'semantic', scope: 'user', confidence: 0.4 },
        { text: 'The user prefers metric units.', type: 'semantic', scope: 'user', confidence: 0.8 },
      ]),
    );
    expect(out.candidates.map((c) => c.text)).toEqual(['The user prefers metric units.']);
  });

  it('drops candidates that look like a secret (memory.md step 2)', async () => {
    const out = await run(
      reply([
        { text: 'The user password: sup3rSecret123', type: 'semantic', scope: 'user', confidence: 0.9 },
        { text: 'The user prefers dark mode.', type: 'semantic', scope: 'user', confidence: 0.9 },
      ]),
    );
    expect(out.candidates.map((c) => c.text)).toEqual(['The user prefers dark mode.']);
  });

  it('drops refusals, fragments and questions', async () => {
    const out = await run(
      reply([
        { text: "I couldn't find any documents in this project that support an answer", type: 'episodic', scope: 'user', confidence: 0.9 },
        { text: 'Paris', type: 'semantic', scope: 'user', confidence: 1 },
        { text: 'Who is the president?', type: 'semantic', scope: 'user', confidence: 1 },
        { text: 'The user works as a DevOps engineer.', type: 'semantic', scope: 'user', confidence: 0.95 },
      ]),
      'i am working as a devops engineer',
    );
    expect(out.candidates.map((c) => c.text)).toEqual(['The user works as a DevOps engineer.']);
  });

  it('an explicit "remember that" is stored with full confidence', async () => {
    const out = await run(
      reply([{ text: 'The team staging cluster is called atlas.', type: 'semantic', scope: 'project', confidence: 0.6 }]),
      'remember that our staging cluster is called atlas',
    );
    expect(out.candidates[0]!.confidence).toBe(1);
  });
});
