import { describe, expect, it, vi } from 'vitest';
import { INTERRUPTED_NOTICE, recoverInterruptedTurns } from './recoverInterrupted.js';

describe('recoverInterruptedTurns', () => {
  it('closes dangling traces, then adds a notice to chats that end on an unanswered user turn', async () => {
    const execute = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ conversation_id: 'c1' }, { conversation_id: 'c2' }]);
    const n = await recoverInterruptedTurns({ execute } as never);
    expect(n).toBe(2);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(INTERRUPTED_NOTICE).toMatch(/interrupted/);
  });
});
