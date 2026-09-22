import { describe, expect, it, vi } from 'vitest';
import { extractCandidates } from './extraction.js';
import type { AuthedUser } from '../policy/types.js';

function user(): AuthedUser {
  return { id: 'u1', email: 'u@opex.local', role: 'employee', clearance: 1, status: 'active' };
}

describe('extractCandidates', () => {
  it('returns candidates that parse successfully', async () => {
    const chat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        candidates: [{ text: 'prefers Nm over ft-lb', type: 'semantic', scope: 'user', confidence: 0.9 }],
      }),
      tokensIn: 1,
      tokensOut: 1,
    });
    const result = await extractCandidates({ gateway: { chat } as never, user: user(), traceId: 't1' }, 'transcript');
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toBe('prefers Nm over ft-lb');
  });

  // Fail-safe-closed: a parse failure extracts nothing rather than
  // crashing the scheduler that calls this (same pattern as router.ts's
  // fallback-on-unparseable-JSON).
  it('extracts nothing when the model returns unparseable JSON', async () => {
    const chat = vi.fn().mockResolvedValue({ content: 'not json', tokensIn: 1, tokensOut: 1 });
    const result = await extractCandidates({ gateway: { chat } as never, user: user(), traceId: 't1' }, 'transcript');
    expect(result).toEqual([]);
  });

  it('extracts nothing when the model call throws', async () => {
    const chat = vi.fn().mockRejectedValue(new Error('model down'));
    const result = await extractCandidates({ gateway: { chat } as never, user: user(), traceId: 't1' }, 'transcript');
    expect(result).toEqual([]);
  });

  it('drops candidates below the 0.6 confidence threshold (memory.md step 3)', async () => {
    const chat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        candidates: [
          { text: 'a weak guess', type: 'semantic', scope: 'user', confidence: 0.4 },
          { text: 'a strong preference', type: 'semantic', scope: 'user', confidence: 0.8 },
        ],
      }),
      tokensIn: 1,
      tokensOut: 1,
    });
    const result = await extractCandidates({ gateway: { chat } as never, user: user(), traceId: 't1' }, 'transcript');
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toBe('a strong preference');
  });

  it('drops candidates that look like a secret (memory.md step 2)', async () => {
    const chat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        candidates: [
          { text: 'password: sup3rSecret123', type: 'semantic', scope: 'user', confidence: 0.9 },
          { text: 'a durable preference', type: 'semantic', scope: 'user', confidence: 0.9 },
        ],
      }),
      tokensIn: 1,
      tokensOut: 1,
    });
    const result = await extractCandidates({ gateway: { chat } as never, user: user(), traceId: 't1' }, 'transcript');
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toBe('a durable preference');
  });
});
