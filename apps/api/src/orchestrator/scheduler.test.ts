import { describe, expect, it, vi } from 'vitest';
import type { AuthedUser } from '../policy/types.js';
import type { Plan } from './planner.js';

function user(): AuthedUser {
  return { id: 'u1', email: 'u@opex.local', role: 'employee', clearance: 1, status: 'active' };
}

describe('runPlan — general-agent steps (no DB dependency)', () => {
  it('passes an upstream step\'s output to a dependent step as a labeled block, then always synthesizes', async () => {
    const { runPlan } = await import('./scheduler.js');
    const chat = vi.fn().mockImplementation(async (req: { messages: Array<{ content: string }> }) => {
      const userContent = req.messages[req.messages.length - 1]!.content;
      if (userContent.includes('Goal: find the number')) return { content: 'the number is 42', tokensIn: 1, tokensOut: 1, toolCalls: [] };
      if (userContent.includes('Goal: double it')) {
        // Only produces the right answer if step a's output actually arrived as a labeled block.
        const gotUpstream = userContent.includes('<step_output id="a"') && userContent.includes('the number is 42');
        return { content: gotUpstream ? 'doubled: 84' : 'ERROR: no upstream context', tokensIn: 1, tokensOut: 1, toolCalls: [] };
      }
      // The final synthesis call.
      return { content: 'Final answer: 84', tokensIn: 1, tokensOut: 1, toolCalls: [] };
    });

    const plan: Plan = {
      steps: [
        { id: 'a', agent: 'general', goal: 'find the number', inputsFrom: [], tools: [] },
        { id: 'b', agent: 'general', goal: 'double it', inputsFrom: ['a'], tools: [] },
      ],
    };

    const result = await runPlan(
      { db: {} as never, gateway: { chat } as never, spanWriter: { writeSpan: vi.fn() } as never, sandboxRunnerUrl: 'x', sandboxSharedSecret: 'x', dataDir: '/data', user: user(), traceId: 't1', conversationId: 'c1', workspaceId: 'w1', projectId: 'p1', taskClassification: 0 },
      plan,
      'find a number and double it',
    );

    expect(result).toBe('Final answer: 84');
    expect(chat).toHaveBeenCalledTimes(3); // step a, step b, synthesis
  });

  it('runs independent steps concurrently within a wave', async () => {
    const { runPlan } = await import('./scheduler.js');
    const order: string[] = [];
    const chat = vi.fn().mockImplementation(async (req: { messages: Array<{ content: string }> }) => {
      const userContent = req.messages[req.messages.length - 1]!.content;
      if (userContent.includes('Goal: task A')) {
        order.push('A:start');
        await new Promise((r) => setTimeout(r, 15));
        order.push('A:end');
        return { content: 'A done', tokensIn: 1, tokensOut: 1, toolCalls: [] };
      }
      if (userContent.includes('Goal: task B')) {
        order.push('B:start');
        await new Promise((r) => setTimeout(r, 1));
        order.push('B:end');
        return { content: 'B done', tokensIn: 1, tokensOut: 1, toolCalls: [] };
      }
      return { content: 'synthesis', tokensIn: 1, tokensOut: 1, toolCalls: [] };
    });

    const plan: Plan = {
      steps: [
        { id: 'a', agent: 'general', goal: 'task A', inputsFrom: [], tools: [] },
        { id: 'b', agent: 'general', goal: 'task B', inputsFrom: [], tools: [] },
      ],
    };

    await runPlan(
      { db: {} as never, gateway: { chat } as never, spanWriter: { writeSpan: vi.fn() } as never, sandboxRunnerUrl: 'x', sandboxSharedSecret: 'x', dataDir: '/data', user: user(), traceId: 't1', conversationId: 'c1', workspaceId: 'w1', projectId: 'p1', taskClassification: 0 },
      plan,
      'do both',
    );

    // If sequential, B wouldn't start until A finished.
    expect(order.indexOf('B:start')).toBeLessThan(order.indexOf('A:end'));
  });
});

describe('runPlan — a step that pauses for approval', () => {
  it('leaves an explained gap in that step\'s output instead of crashing the plan', async () => {
    vi.doMock('./agents.js', () => ({
      loadAgent: vi.fn().mockResolvedValue({
        id: 'a1',
        name: 'code',
        version: 1,
        description: '',
        systemPromptTemplate: 'x',
        modelRole: 'general',
        toolAllowlist: ['code_exec'],
        maxIterations: 8,
        requiresApprovalTools: ['code_exec'],
        enabled: true,
        allowedGroups: [],
      }),
      loadAgentSystemPrompt: vi.fn().mockResolvedValue('sys'),
    }));
    vi.doMock('./executor.js', () => ({
      runExecutor: vi.fn().mockResolvedValue({
        status: 'approval_required',
        approvalId: 'approval1',
        toolName: 'code_exec',
        args: {},
        reason: "the code agent's \"code_exec\" tool always requires approval",
      }),
    }));
    vi.resetModules();

    const { runPlan } = await import('./scheduler.js');
    const chat = vi.fn().mockResolvedValue({ content: 'synthesis mentions the gap', tokensIn: 1, tokensOut: 1, toolCalls: [] });
    const db = {
      insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: 'step-trace-1' }]) }) }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    };

    const plan: Plan = { steps: [{ id: 'a', agent: 'code', goal: 'run some code', inputsFrom: [], tools: ['code_exec'] }] };

    const result = await runPlan(
      { db: db as never, gateway: { chat } as never, spanWriter: { writeSpan: vi.fn() } as never, sandboxRunnerUrl: 'x', sandboxSharedSecret: 'x', dataDir: '/data', user: user(), traceId: 't1', conversationId: 'c1', workspaceId: 'w1', projectId: 'p1', taskClassification: 0 },
      plan,
      'run some code',
    );

    expect(result).toBe('synthesis mentions the gap');
    const synthesisCall = chat.mock.calls[0]![0] as { messages: Array<{ content: string }> };
    const synthesisInput = synthesisCall.messages[synthesisCall.messages.length - 1]!.content;
    expect(synthesisInput).toContain('needs human approval');

    vi.doUnmock('./agents.js');
    vi.doUnmock('./executor.js');
  });
});
