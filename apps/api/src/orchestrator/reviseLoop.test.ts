import { describe, expect, it, vi } from 'vitest';
import { answerWithVerification } from './reviseLoop.js';
import type { AuthedUser } from '../policy/types.js';

function user(): AuthedUser {
  return { id: 'u1', email: 'u@opex.local', role: 'employee', clearance: 1, status: 'active' };
}

function groundednessResponse(verdict: 'supported' | 'unsupported'): string {
  return JSON.stringify({ sentences: [{ index: 0, verdict }] });
}

describe('answerWithVerification', () => {
  it('returns high confidence and zero revisions when the first answer is already grounded', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce({ content: 'The spec is 50 Nm [1].', tokensIn: 1, tokensOut: 1, toolCalls: [] })
      .mockResolvedValueOnce({ content: groundednessResponse('supported'), tokensIn: 1, tokensOut: 1, toolCalls: [] });

    const result = await answerWithVerification(
      { gateway: { chat } as never, user: user(), traceId: 't1' },
      'sys',
      [{ role: 'user', content: 'what is the spec?' }],
      [{ marker: 1, text: 'Spec: 50 Nm.' }],
      new Set([1]),
    );

    expect(result.confidence).toBe('high');
    expect(result.revisions).toBe(0);
    expect(result.answer).toBe('The spec is 50 Nm [1].');
    expect(chat).toHaveBeenCalledTimes(2); // one answer + one groundedness check, no revision needed
  });

  it('revises once and succeeds when the second attempt is grounded', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce({ content: 'The spec is 500 Nm [1].', tokensIn: 1, tokensOut: 1, toolCalls: [] })
      .mockResolvedValueOnce({ content: groundednessResponse('unsupported'), tokensIn: 1, tokensOut: 1, toolCalls: [] })
      .mockResolvedValueOnce({ content: 'The spec is 50 Nm [1].', tokensIn: 1, tokensOut: 1, toolCalls: [] })
      .mockResolvedValueOnce({ content: groundednessResponse('supported'), tokensIn: 1, tokensOut: 1, toolCalls: [] });

    const result = await answerWithVerification(
      { gateway: { chat } as never, user: user(), traceId: 't1' },
      'sys',
      [{ role: 'user', content: 'what is the spec?' }],
      [{ marker: 1, text: 'Spec: 50 Nm.' }],
      new Set([1]),
    );

    expect(result.confidence).toBe('high');
    expect(result.revisions).toBe(1);
    expect(result.answer).toBe('The spec is 50 Nm [1].');
    expect(chat).toHaveBeenCalledTimes(4);

    // The second answer attempt's messages must include feedback about the unsupported claim.
    const secondAttemptMessages = chat.mock.calls[2]![0].messages;
    expect(secondAttemptMessages.some((m: { role: string }) => m.role === 'user' && m.content.includes('500 Nm'))).toBe(
      true,
    );
  });

  it('gives up after the max attempts and returns low confidence with the last answer', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce({ content: 'attempt 1 [1].', tokensIn: 1, tokensOut: 1, toolCalls: [] })
      .mockResolvedValueOnce({ content: groundednessResponse('unsupported'), tokensIn: 1, tokensOut: 1, toolCalls: [] })
      .mockResolvedValueOnce({ content: 'attempt 2 [1].', tokensIn: 1, tokensOut: 1, toolCalls: [] })
      .mockResolvedValueOnce({ content: groundednessResponse('unsupported'), tokensIn: 1, tokensOut: 1, toolCalls: [] })
      .mockResolvedValueOnce({ content: 'attempt 3 [1].', tokensIn: 1, tokensOut: 1, toolCalls: [] })
      .mockResolvedValueOnce({ content: groundednessResponse('unsupported'), tokensIn: 1, tokensOut: 1, toolCalls: [] });

    const result = await answerWithVerification(
      { gateway: { chat } as never, user: user(), traceId: 't1' },
      'sys',
      [{ role: 'user', content: 'what is the spec?' }],
      [{ marker: 1, text: 'Spec: 50 Nm.' }],
      new Set([1]),
    );

    expect(result.confidence).toBe('low');
    expect(result.revisions).toBe(2);
    expect(result.answer).toBe('attempt 3 [1].');
    expect(chat).toHaveBeenCalledTimes(6); // 3 attempts, each with its own groundedness check
  });
});
