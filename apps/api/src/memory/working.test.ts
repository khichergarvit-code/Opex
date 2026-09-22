import { describe, expect, it, vi } from 'vitest';
import { getWorkingMemory, type WorkingMemoryTurn } from './working.js';
import type { AuthedUser } from '../policy/types.js';

function user(): AuthedUser {
  return { id: 'u1', email: 'u@opex.local', name: 'User', role: 'employee', clearance: 1, status: 'active' };
}

describe('getWorkingMemory', () => {
  it('returns the full history unfolded when under budget', async () => {
    const chat = vi.fn();
    const history: WorkingMemoryTurn[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    const result = await getWorkingMemory(
      { gateway: { chat } as never, user: user(), traceId: 't1' },
      history,
      null,
    );
    expect(result.folded).toBe(false);
    expect(result.recentTurns).toEqual(history);
    expect(chat).not.toHaveBeenCalled();
  });

  it('folds older turns into a summary once over budget, keeping the last N raw', async () => {
    const chat = vi.fn().mockResolvedValue({ content: 'a folded summary', tokensIn: 1, tokensOut: 1 });
    // Build enough long turns to exceed the 60%-of-2000-token trigger.
    const longTurn = (i: number): WorkingMemoryTurn => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'word '.repeat(200), // ~260 approx tokens per turn
    });
    const history = Array.from({ length: 10 }, (_, i) => longTurn(i));

    const result = await getWorkingMemory(
      { gateway: { chat } as never, user: user(), traceId: 't1' },
      history,
      null,
    );

    expect(result.folded).toBe(true);
    expect(result.summary).toBe('a folded summary');
    expect(result.recentTurns).toHaveLength(6);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(chat.mock.calls[0]![0].role).toBe('general');
  });

  it('never folds when history has 6 or fewer turns, even if long', async () => {
    const chat = vi.fn();
    const history = Array.from({ length: 6 }, () => ({
      role: 'user' as const,
      content: 'word '.repeat(500),
    }));
    const result = await getWorkingMemory(
      { gateway: { chat } as never, user: user(), traceId: 't1' },
      history,
      null,
    );
    expect(result.folded).toBe(false);
    expect(chat).not.toHaveBeenCalled();
  });
});
