import { describe, expect, it, vi } from 'vitest';
import type { AgentConfig } from './types.js';
import type { AuthedUser } from '../policy/types.js';

// Isolated from executor.test.ts's suite so mocking TOOL_REGISTRY here
// can't affect those tests' use of the real tool definitions.
vi.mock('./tools/index.js', () => {
  const events: string[] = [];
  const slowStart = vi.fn(async () => {
    events.push('slow:start');
    await new Promise((resolve) => setTimeout(resolve, 20));
    events.push('slow:end');
    return { ok: true, summary: 'slow done', artifactIds: [] };
  });
  const fastStart = vi.fn(async () => {
    events.push('fast:start');
    await new Promise((resolve) => setTimeout(resolve, 1));
    events.push('fast:end');
    return { ok: true, summary: 'fast done', artifactIds: [] };
  });
  return {
    TOOL_REGISTRY: {
      slow_tool: { name: 'slow_tool', description: '', parameters: {}, execute: slowStart },
      fast_tool: { name: 'fast_tool', description: '', parameters: {}, execute: fastStart },
    },
    __events: events,
  };
});

const { runExecutor } = await import('./executor.js');
const toolsModule = (await import('./tools/index.js')) as unknown as { __events: string[] };

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
    toolAllowlist: ['slow_tool', 'fast_tool'],
    maxIterations: 8,
    requiresApprovalTools: [],
    enabled: true,
    allowedGroups: [],
    ...overrides,
  };
}

describe('runExecutor — concurrent tool calls (B3c)', () => {
  it('runs two independent calls from the same batch concurrently, not sequentially', async () => {
    toolsModule.__events.length = 0;
    const chat = vi
      .fn()
      .mockResolvedValueOnce({
        content: '',
        tokensIn: 1,
        tokensOut: 1,
        toolCalls: [
          { id: 'call-slow', name: 'slow_tool', arguments: '{}' },
          { id: 'call-fast', name: 'fast_tool', arguments: '{}' },
        ],
      })
      .mockResolvedValueOnce({ content: 'done', tokensIn: 1, tokensOut: 1, toolCalls: [] });

    const result = await runExecutor(
      { db: {} as never, gateway: { chat } as never, spanWriter: { writeSpan: vi.fn() }, sandboxRunnerUrl: 'x', sandboxSharedSecret: 'x', dataDir: '/data' },
      {
        agent: agent(),
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'run both' }],
        user: user(),
        traceId: 't1',
        conversationId: 'c1',
        workspaceId: 'w1',
        projectId: 'p1',
        taskClassification: 0,
      },
    );

    expect(result.status).toBe('ok');
    // If sequential, order would be slow:start, slow:end, fast:start, fast:end.
    // Concurrent execution starts both before either finishes.
    expect(toolsModule.__events.slice(0, 2).sort()).toEqual(['fast:start', 'slow:start']);
    expect(toolsModule.__events.indexOf('fast:start')).toBeLessThan(toolsModule.__events.indexOf('slow:end'));
  });
});
