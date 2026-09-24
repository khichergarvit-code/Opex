import { describe, expect, it, vi } from 'vitest';
import { answerWithVerification } from './reviseLoop.js';
import type { AuthedUser } from '../policy/types.js';

function user(): AuthedUser {
  return { id: 'u1', email: 'u@opex.local', role: 'employee', clearance: 1, status: 'active' };
}

function groundednessResponse(verdict: 'supported' | 'unsupported'): string {
  return JSON.stringify({ sentences: [{ index: 0, verdict }] });
}

/** Answers stream through chatStream (split into 2 deltas); groundedness checks go through chat. */
function fakeGateway(answers: string[], verdicts: Array<'supported' | 'unsupported'>) {
  const answerQueue = [...answers];
  const chatStream = vi.fn(async function* () {
    const text = answerQueue.shift() ?? '';
    const mid = Math.ceil(text.length / 2);
    yield text.slice(0, mid);
    yield text.slice(mid);
  });
  const verdictQueue = [...verdicts];
  const chat = vi.fn(async () => ({
    content: groundednessResponse(verdictQueue.shift() ?? 'unsupported'),
    tokensIn: 1,
    tokensOut: 1,
    toolCalls: [],
  }));
  return { chat, chatStream };
}

const messages = [{ role: 'user' as const, content: 'what is the spec?' }];
const chunks = [{ marker: 1, text: 'Spec: 50 Nm.' }];

describe('answerWithVerification', () => {
  it('returns high confidence and zero revisions when the first answer is already grounded', async () => {
    const gw = fakeGateway(['The spec is 50 Nm [1].'], ['supported']);

    const result = await answerWithVerification(
      { gateway: gw as never, user: user(), traceId: 't1' },
      'sys',
      messages,
      chunks,
      new Set([1]),
    );

    expect(result.confidence).toBe('high');
    expect(result.revisions).toBe(0);
    expect(result.answer).toBe('The spec is 50 Nm [1].');
    expect(gw.chatStream).toHaveBeenCalledTimes(1);
    expect(gw.chat).toHaveBeenCalledTimes(1); // one groundedness check, no revision needed
  });

  it('streams each draft live and signals the start of every attempt', async () => {
    const gw = fakeGateway(['The spec is 500 Nm [1].', 'The spec is 50 Nm [1].'], ['unsupported', 'supported']);
    const tokens: string[] = [];
    const attempts: number[] = [];
    const verifying = vi.fn();

    const result = await answerWithVerification(
      { gateway: gw as never, user: user(), traceId: 't1' },
      'sys',
      messages,
      chunks,
      new Set([1]),
      { onDraftToken: (d) => tokens.push(d), onAttemptStart: (a) => attempts.push(a), onVerifying: verifying },
    );

    expect(attempts).toEqual([0, 1]);
    expect(verifying).toHaveBeenCalledTimes(2);
    expect(tokens.join('')).toBe('The spec is 500 Nm [1].The spec is 50 Nm [1].');
    expect(result.answer).toBe('The spec is 50 Nm [1].');
  });

  it('passes the chosen model id through to the answer generation', async () => {
    const gw = fakeGateway(['ok [1].'], ['supported']);
    await answerWithVerification(
      { gateway: gw as never, user: user(), traceId: 't1' },
      'sys',
      messages,
      chunks,
      new Set([1]),
      { modelId: 'llm-small' },
    );
    expect(gw.chatStream.mock.calls[0]![0]).toMatchObject({ modelId: 'llm-small', role: 'general' });
  });

  it('revises once and succeeds when the second attempt is grounded', async () => {
    const gw = fakeGateway(['The spec is 500 Nm [1].', 'The spec is 50 Nm [1].'], ['unsupported', 'supported']);

    const result = await answerWithVerification(
      { gateway: gw as never, user: user(), traceId: 't1' },
      'sys',
      messages,
      chunks,
      new Set([1]),
    );

    expect(result.confidence).toBe('high');
    expect(result.revisions).toBe(1);
    expect(result.answer).toBe('The spec is 50 Nm [1].');
    expect(gw.chatStream).toHaveBeenCalledTimes(2);
    expect(gw.chat).toHaveBeenCalledTimes(2);

    // The second answer attempt's messages must include feedback about the unsupported claim.
    const secondAttemptMessages = gw.chatStream.mock.calls[1]![0].messages;
    expect(secondAttemptMessages.some((m: { role: string; content: string }) => m.role === 'user' && m.content.includes('500 Nm'))).toBe(true);
  });

  it('gives up after the max attempts and returns low confidence with the last answer', async () => {
    const gw = fakeGateway(['attempt 1 [1].', 'attempt 2 [1].', 'attempt 3 [1].'], ['unsupported', 'unsupported', 'unsupported']);

    const result = await answerWithVerification(
      { gateway: gw as never, user: user(), traceId: 't1' },
      'sys',
      messages,
      chunks,
      new Set([1]),
    );

    expect(result.confidence).toBe('low');
    expect(result.revisions).toBe(2);
    expect(result.answer).toBe('attempt 3 [1].');
    expect(gw.chatStream).toHaveBeenCalledTimes(3);
    expect(gw.chat).toHaveBeenCalledTimes(3); // each attempt gets its own groundedness check
  });
});
