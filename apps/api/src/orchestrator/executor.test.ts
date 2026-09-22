import { describe, expect, it, vi } from 'vitest';
import { runExecutor } from './executor.js';
import type { AgentConfig } from './types.js';
import type { AuthedUser } from '../policy/types.js';

function user(): AuthedUser {
  return { id: 'u1', email: 'u@opex.local', role: 'employee', clearance: 1, status: 'active' };
}

function agent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'a1',
    name: 'analysis',
    version: 1,
    description: '',
    systemPromptTemplate: 'x',
    modelRole: 'general',
    toolAllowlist: ['code_exec'],
    maxIterations: 8,
    requiresApprovalTools: [],
    enabled: true,
    allowedGroups: [],
    ...overrides,
  };
}

describe('runExecutor', () => {
  it('returns the answer directly when the model makes no tool calls', async () => {
    const chat = vi.fn().mockResolvedValue({ content: 'hello!', tokensIn: 1, tokensOut: 1, toolCalls: [] });
    const result = await runExecutor(
      { db: {} as never, gateway: { chat } as never, spanWriter: { writeSpan: vi.fn() }, sandboxRunnerUrl: 'x', sandboxSharedSecret: 'x', dataDir: '/data' },
      {
        agent: agent(),
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        user: user(),
        traceId: 't1',
        conversationId: 'c1',
        workspaceId: 'w1',
        projectId: 'p1',
        taskClassification: 0,
      },
    );
    expect(result.answer).toBe('hello!');
    expect(result.toolCallCount).toBe(0);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('runs an allowlisted tool call, feeds the result back, and returns the final answer', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce({
        content: '',
        tokensIn: 1,
        tokensOut: 1,
        toolCalls: [{ id: 'call1', name: 'code_exec', arguments: '{"code":"print(1)"}' }],
      })
      .mockResolvedValueOnce({ content: 'the answer is 1', tokensIn: 1, tokensOut: 1, toolCalls: [] });

    const toolResults: unknown[] = [];
    const result = await runExecutor(
      { db: {} as never, gateway: { chat } as never, spanWriter: { writeSpan: vi.fn() }, sandboxRunnerUrl: 'x', sandboxSharedSecret: 'x', dataDir: '/data' },
      {
        agent: agent(),
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'run this' }],
        user: user(),
        traceId: 't1',
        conversationId: 'c1',
        workspaceId: 'w1',
        projectId: 'p1',
        taskClassification: 0,
        onToolResult: (e) => toolResults.push(e),
      },
    );

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.answer).toBe('the answer is 1');
    expect(result.toolCallCount).toBe(1);
    expect(toolResults).toHaveLength(1);

    // The second chat() call's messages must include the tool result turn.
    const secondCallMessages = chat.mock.calls[1]![0].messages;
    expect(secondCallMessages.some((m: { role: string }) => m.role === 'tool')).toBe(true);
  });

  it('denies a tool call not in the agent allowlist without executing it', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce({
        content: '',
        tokensIn: 1,
        tokensOut: 1,
        toolCalls: [{ id: 'call1', name: 'make_chart', arguments: '{}' }],
      })
      .mockResolvedValueOnce({ content: 'done', tokensIn: 1, tokensOut: 1, toolCalls: [] });

    const toolResults: Array<{ result?: { ok: boolean } }> = [];
    await runExecutor(
      { db: {} as never, gateway: { chat } as never, spanWriter: { writeSpan: vi.fn() }, sandboxRunnerUrl: 'x', sandboxSharedSecret: 'x', dataDir: '/data' },
      {
        agent: agent({ toolAllowlist: ['code_exec'] }), // make_chart NOT allowlisted
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'chart this' }],
        user: user(),
        traceId: 't1',
        conversationId: 'c1',
        workspaceId: 'w1',
        projectId: 'p1',
        taskClassification: 0,
        onToolResult: (e) => toolResults.push(e),
      },
    );

    expect(toolResults[0]?.result?.ok).toBe(false);
  });

  it('stops after max_iterations and reports hitIterationLimit', async () => {
    const chat = vi.fn().mockResolvedValue({
      content: '',
      tokensIn: 1,
      tokensOut: 1,
      toolCalls: [{ id: 'callX', name: 'code_exec', arguments: '{"code":"pass"}' }],
    });

    const result = await runExecutor(
      {
        db: {} as never,
        gateway: { chat } as never,
        spanWriter: { writeSpan: vi.fn() },
        sandboxRunnerUrl: 'http://nonexistent.invalid',
        sandboxSharedSecret: 'x',
        dataDir: '/data',
      },
      {
        agent: agent({ maxIterations: 2 }),
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'loop forever' }],
        user: user(),
        traceId: 't1',
        conversationId: 'c1',
        workspaceId: 'w1',
        projectId: 'p1',
        taskClassification: 0,
      },
    );

    expect(result.hitIterationLimit).toBe(true);
    expect(chat).toHaveBeenCalledTimes(2);
  });
});
