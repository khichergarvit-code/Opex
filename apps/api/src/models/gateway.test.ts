import { describe, expect, it, vi } from 'vitest';
import { ModelGateway, PolicyDeniedError, type SpanWriter } from './gateway.js';
import type { AuthedUser } from '../policy/types.js';

function fakeDb(row: { id: string; endpoint: string; role: string; enabled: boolean }) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [row],
        }),
      }),
    }),
  } as never;
}

function fakeUser(role: AuthedUser['role'] = 'employee'): AuthedUser {
  return { id: 'u1', email: 'u@opex.local', name: 'User', role, clearance: 1, status: 'active' };
}

function spanRecorder(): { spanWriter: SpanWriter; spans: unknown[] } {
  const spans: unknown[] = [];
  return {
    spans,
    spanWriter: {
      writeSpan: async (span) => {
        spans.push(span);
      },
    },
  };
}

describe('ModelGateway.chat', () => {
  it('denies model:invoke for a role the user is not allowed to use, without calling the model', async () => {
    const db = fakeDb({ id: 'llm-main', endpoint: 'http://x', role: 'coder', enabled: true });
    const { spanWriter, spans } = spanRecorder();
    const chatFn = vi.fn();
    const gw = new ModelGateway({ db, spanWriter, fns: { chat: chatFn } });

    await expect(
      gw.chat({
        role: 'coder',
        messages: [{ role: 'user', content: 'hi' }],
        user: fakeUser('employee'),
        traceId: 't1',
      }),
    ).rejects.toBeInstanceOf(PolicyDeniedError);
    expect(chatFn).not.toHaveBeenCalled();
    expect(spans).toHaveLength(0);
  });

  it('writes an ok span with token counts on success', async () => {
    const db = fakeDb({ id: 'llm-small', endpoint: 'http://x', role: 'router', enabled: true });
    const { spanWriter, spans } = spanRecorder();
    const chatFn = vi.fn().mockResolvedValue({ content: 'hello', tokensIn: 5, tokensOut: 3 });
    const gw = new ModelGateway({ db, spanWriter, fns: { chat: chatFn } });

    const result = await gw.chat({
      role: 'router',
      messages: [{ role: 'user', content: 'hi' }],
      user: fakeUser('employee'),
      traceId: 't1',
    });

    expect(result.content).toBe('hello');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ status: 'ok', tokensIn: 5, tokensOut: 3, model: 'llm-small' });
  });

  it('writes an error span and rethrows on failure', async () => {
    const db = fakeDb({ id: 'llm-small', endpoint: 'http://x', role: 'router', enabled: true });
    const { spanWriter, spans } = spanRecorder();
    const chatFn = vi.fn().mockRejectedValue(new Error('llama-server 500'));
    const gw = new ModelGateway({ db, spanWriter, fns: { chat: chatFn } });

    await expect(
      gw.chat({
        role: 'router',
        messages: [{ role: 'user', content: 'hi' }],
        user: fakeUser('employee'),
        traceId: 't1',
      }),
    ).rejects.toThrow('llama-server 500');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ status: 'error' });
  });

  it('opens the circuit after repeated failures and stops calling the model', async () => {
    const db = fakeDb({ id: 'llm-small', endpoint: 'http://x', role: 'router', enabled: true });
    const { spanWriter } = spanRecorder();
    const chatFn = vi.fn().mockRejectedValue(new Error('llama-server 500'));
    const gw = new ModelGateway({ db, spanWriter, fns: { chat: chatFn } });

    const req = {
      role: 'router' as const,
      messages: [{ role: 'user' as const, content: 'hi' }],
      user: fakeUser('employee'),
      traceId: 't1',
    };

    for (let i = 0; i < 5; i++) {
      await expect(gw.chat(req)).rejects.toThrow();
    }
    const callsBeforeOpen = chatFn.mock.calls.length;
    await expect(gw.chat(req)).rejects.toThrow(/Circuit open/);
    expect(chatFn.mock.calls.length).toBe(callsBeforeOpen);
  });
});

describe('ModelGateway.rerank', () => {
  it('returns scores and writes an ok span on success', async () => {
    const db = fakeDb({ id: 'llm-rerank', endpoint: 'http://x', role: 'rerank', enabled: true });
    const { spanWriter, spans } = spanRecorder();
    const rerankFn = vi.fn().mockResolvedValue([-2.3, -11.0]);
    const gw = new ModelGateway({ db, spanWriter, fns: { rerank: rerankFn } });

    const scores = await gw.rerank({
      query: 'torque spec',
      documents: ['bolt A is 50 Nm', 'the weather is sunny'],
      user: fakeUser('employee'),
      traceId: 't1',
    });

    expect(scores).toEqual([-2.3, -11.0]);
    expect(rerankFn).toHaveBeenCalledWith('http://x', 'torque spec', [
      'bolt A is 50 Nm',
      'the weather is sunny',
    ]);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ status: 'ok', model: 'llm-rerank' });
  });

  it('denies model:invoke for a role without rerank access', async () => {
    const db = fakeDb({ id: 'llm-rerank', endpoint: 'http://x', role: 'rerank', enabled: true });
    const { spanWriter } = spanRecorder();
    const rerankFn = vi.fn();
    const gw = new ModelGateway({ db, spanWriter, fns: { rerank: rerankFn } });

    await expect(
      gw.rerank({
        query: 'q',
        documents: ['d'],
        user: { ...fakeUser('employee'), status: 'disabled' },
        traceId: 't1',
      }),
    ).rejects.toBeInstanceOf(PolicyDeniedError);
    expect(rerankFn).not.toHaveBeenCalled();
  });
});
