import { describe, expect, it, vi } from 'vitest';
import { parseExecutorCheckpoint, resumeExecutor, runExecutor, type ExecutorCheckpoint } from './executor.js';
import type { AgentConfig } from './types.js';
import type { AuthedUser } from '../policy/types.js';

function user(): AuthedUser {
  return { id: 'u1', email: 'u@opex.local', role: 'employee', clearance: 1, status: 'active' };
}

function checkpoint(overrides: Partial<ExecutorCheckpoint> = {}): ExecutorCheckpoint {
  return {
    agent: agent(),
    messages: [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'run this' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call1', type: 'function', function: { name: 'made_up_tool', arguments: '{}' } }],
      },
    ],
    iteration: 0,
    toolCallCount: 1,
    pendingCall: { id: 'call1', name: 'made_up_tool', arguments: '{}' },
    remainingCalls: [],
    user: user(),
    traceId: 't1',
    conversationId: 'c1',
    workspaceId: 'w1',
    projectId: 'p1',
    taskClassification: 0,
    ...overrides,
  };
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
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
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
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
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

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
    expect(result.hitIterationLimit).toBe(true);
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it('pauses for approval on an agent-configured approval-required tool and never executes it', async () => {
    const chat = vi.fn().mockResolvedValueOnce({
      content: '',
      tokensIn: 1,
      tokensOut: 1,
      toolCalls: [{ id: 'call1', name: 'code_exec', arguments: '{"code":"print(1)"}' }],
    });
    const inserted: Array<Record<string, unknown>> = [];
    const db = {
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          inserted.push(v);
          return { returning: () => Promise.resolve([{ id: 'approval1' }]) };
        },
      }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    };

    const toolResults: unknown[] = [];
    const result = await runExecutor(
      { db: db as never, gateway: { chat } as never, spanWriter: { writeSpan: vi.fn() }, sandboxRunnerUrl: 'x', sandboxSharedSecret: 'x', dataDir: '/data' },
      {
        agent: agent({ requiresApprovalTools: ['code_exec'] }),
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

    expect(result.status).toBe('approval_required');
    if (result.status !== 'approval_required') throw new Error('unreachable');
    expect(result.approvalId).toBe('approval1');
    expect(result.toolName).toBe('code_exec');
    // The tool never actually ran — no onToolResult callback fired for it.
    expect(toolResults).toHaveLength(0);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.toolName).toBe('code_exec');
  });
});

describe('resumeExecutor', () => {
  it('executes the pending call when approved, then continues the loop', async () => {
    const chat = vi.fn().mockResolvedValueOnce({ content: 'done', tokensIn: 1, tokensOut: 1, toolCalls: [] });
    const toolResults: Array<{ result?: { ok: boolean; summary: string } }> = [];
    const result = await resumeExecutor(
      { db: {} as never, gateway: { chat } as never, spanWriter: { writeSpan: vi.fn() }, sandboxRunnerUrl: 'x', sandboxSharedSecret: 'x', dataDir: '/data' },
      { onToolResult: (e) => toolResults.push(e) },
      checkpoint(),
      'approved',
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
    expect(result.answer).toBe('done');
    expect(toolResults).toHaveLength(1);
    // made_up_tool isn't in TOOL_REGISTRY — "approved" means it's actually
    // attempted, which surfaces as this deterministic, no-network outcome.
    expect(toolResults[0]?.result?.summary).toContain('unknown tool');
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('denies the pending call without executing it when denied', async () => {
    const chat = vi.fn().mockResolvedValueOnce({ content: 'done', tokensIn: 1, tokensOut: 1, toolCalls: [] });
    const toolResults: Array<{ result?: { ok: boolean; summary: string } }> = [];
    const result = await resumeExecutor(
      { db: {} as never, gateway: { chat } as never, spanWriter: { writeSpan: vi.fn() }, sandboxRunnerUrl: 'x', sandboxSharedSecret: 'x', dataDir: '/data' },
      { onToolResult: (e) => toolResults.push(e) },
      checkpoint(),
      'denied',
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0]?.result?.summary).toBe('denied by reviewer');
  });

  it('pauses again if a remaining call in the same batch also needs approval', async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const db = {
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          inserted.push(v);
          return { returning: () => Promise.resolve([{ id: 'approval2' }]) };
        },
      }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    };
    const result = await resumeExecutor(
      { db: db as never, gateway: {} as never, spanWriter: { writeSpan: vi.fn() }, sandboxRunnerUrl: 'x', sandboxSharedSecret: 'x', dataDir: '/data' },
      {},
      checkpoint({
        agent: agent({ requiresApprovalTools: ['code_exec'] }),
        remainingCalls: [{ id: 'call2', name: 'code_exec', arguments: '{}' }],
      }),
      'denied',
    );
    expect(result.status).toBe('approval_required');
    if (result.status !== 'approval_required') throw new Error('unreachable');
    expect(result.toolName).toBe('code_exec');
    expect(inserted).toHaveLength(1);
  });
});

describe('parseExecutorCheckpoint', () => {
  it('round-trips a valid checkpoint through a JSON (jsonb) boundary', () => {
    const raw = JSON.parse(JSON.stringify(checkpoint()));
    expect(() => parseExecutorCheckpoint(raw)).not.toThrow();
  });

  it('rejects a malformed checkpoint', () => {
    expect(() => parseExecutorCheckpoint({ notACheckpoint: true })).toThrow();
  });
});
