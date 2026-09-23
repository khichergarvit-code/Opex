import { describe, expect, it, vi } from 'vitest';
import { planTask } from './planner.js';
import type { AuthedUser } from '../policy/types.js';

function user(): AuthedUser {
  return { id: 'u1', email: 'u@opex.local', role: 'employee', clearance: 1, status: 'active' };
}

describe('planTask', () => {
  it('parses a valid plan and maps inputs_from to inputsFrom', async () => {
    const chat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        steps: [
          { id: 'a', agent: 'doc_qa', goal: 'find the spec', inputs_from: [], tools: ['doc_search'] },
          { id: 'b', agent: 'general', goal: 'summarize', inputs_from: ['a'], tools: [] },
        ],
      }),
      tokensIn: 1,
      tokensOut: 1,
      toolCalls: [],
    });
    const plan = await planTask({ gateway: { chat } as never, user: user(), traceId: 't1' }, 'find the spec and summarize');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[1]).toEqual({ id: 'b', agent: 'general', goal: 'summarize', inputsFrom: ['a'], tools: [] });
  });

  it('falls back to a single general step on a parse failure', async () => {
    const chat = vi.fn().mockResolvedValue({ content: 'not json', tokensIn: 1, tokensOut: 1, toolCalls: [] });
    const plan = await planTask({ gateway: { chat } as never, user: user(), traceId: 't1' }, 'do the thing');
    expect(plan.steps).toEqual([{ id: 'step1', agent: 'general', goal: 'do the thing', inputsFrom: [], tools: [] }]);
  });

  it('falls back to a single general step when the model returns zero steps', async () => {
    const chat = vi.fn().mockResolvedValue({ content: JSON.stringify({ steps: [] }), tokensIn: 1, tokensOut: 1, toolCalls: [] });
    const plan = await planTask({ gateway: { chat } as never, user: user(), traceId: 't1' }, 'do the thing');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.agent).toBe('general');
  });

  it('falls back to a single general step when the gateway call throws', async () => {
    const chat = vi.fn().mockRejectedValue(new Error('model unreachable'));
    const plan = await planTask({ gateway: { chat } as never, user: user(), traceId: 't1' }, 'do the thing');
    expect(plan.steps).toHaveLength(1);
  });
});
