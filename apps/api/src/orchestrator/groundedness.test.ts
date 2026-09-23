import { describe, expect, it, vi } from 'vitest';
import { verifyGroundedness } from './groundedness.js';
import type { AuthedUser } from '../policy/types.js';

function user(): AuthedUser {
  return { id: 'u1', email: 'u@opex.local', role: 'employee', clearance: 1, status: 'active' };
}

describe('verifyGroundedness', () => {
  it('passes trivially when the answer cites no claims', async () => {
    const chat = vi.fn();
    const result = await verifyGroundedness(
      { gateway: { chat } as never, user: user(), traceId: 't1' },
      'I found no supporting documents.',
      [],
      new Set(),
    );
    expect(result.ok).toBe(true);
    expect(chat).not.toHaveBeenCalled();
  });

  it('passes when the model classifies every cited sentence as supported', async () => {
    const chat = vi.fn().mockResolvedValue({
      content: JSON.stringify({ sentences: [{ index: 0, verdict: 'supported' }] }),
      tokensIn: 1,
      tokensOut: 1,
      toolCalls: [],
    });
    const result = await verifyGroundedness(
      { gateway: { chat } as never, user: user(), traceId: 't1' },
      'The torque spec is 50 Nm [1].',
      [{ marker: 1, text: 'Torque spec: 50 Nm.' }],
      new Set([1]),
    );
    expect(result.ok).toBe(true);
  });

  it('flags an unsupported claim and reports it as an unsupported sentence', async () => {
    const chat = vi.fn().mockResolvedValue({
      content: JSON.stringify({ sentences: [{ index: 0, verdict: 'unsupported' }] }),
      tokensIn: 1,
      tokensOut: 1,
      toolCalls: [],
    });
    const result = await verifyGroundedness(
      { gateway: { chat } as never, user: user(), traceId: 't1' },
      'The torque spec is 500 Nm [1].',
      [{ marker: 1, text: 'Torque spec: 50 Nm.' }],
      new Set([1]),
    );
    expect(result.ok).toBe(false);
    expect(result.unsupportedSentences).toEqual(['The torque spec is 500 Nm [1].']);
  });

  it('fails toward the deterministic marker-presence check on a parse failure, not toward maximal distrust', async () => {
    const chat = vi.fn().mockResolvedValue({ content: 'not json at all', tokensIn: 1, tokensOut: 1, toolCalls: [] });
    const result = await verifyGroundedness(
      { gateway: { chat } as never, user: user(), traceId: 't1' },
      'The torque spec is 50 Nm [1].',
      [{ marker: 1, text: 'Torque spec: 50 Nm.' }],
      new Set([1]),
    );
    // The cited marker [1] is valid, so the A3 fallback check passes —
    // a parse hiccup must not turn that into a false "unsupported".
    expect(result.ok).toBe(true);
  });

  it('the deterministic fallback still catches a genuinely invalid marker', async () => {
    const chat = vi.fn().mockResolvedValue({ content: 'not json at all', tokensIn: 1, tokensOut: 1, toolCalls: [] });
    const result = await verifyGroundedness(
      { gateway: { chat } as never, user: user(), traceId: 't1' },
      'The torque spec is 50 Nm [3].',
      [{ marker: 1, text: 'Torque spec: 50 Nm.' }],
      new Set([1]),
    );
    expect(result.ok).toBe(false);
  });
});
