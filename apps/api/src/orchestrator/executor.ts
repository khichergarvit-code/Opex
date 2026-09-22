import type { Db } from '../db/client.js';
import type { ChatMessage } from '../models/types.js';
import type { ModelGateway, SpanWriter } from '../models/gateway.js';
import { can } from '../policy/can.js';
import type { AuthedUser } from '../policy/types.js';
import { TOOL_REGISTRY, type ToolResult } from './tools/index.js';
import type { AgentConfig } from './types.js';

export interface ExecutorDeps {
  db: Db;
  gateway: ModelGateway;
  spanWriter: SpanWriter;
  sandboxRunnerUrl: string;
  sandboxSharedSecret: string;
  dataDir: string;
}

export interface ExecutorToolEvent {
  toolName: string;
  callId: string;
  args?: Record<string, unknown>;
  result?: ToolResult;
}

export interface ExecutorInput {
  agent: AgentConfig;
  systemPrompt: string;
  messages: ChatMessage[];
  user: AuthedUser;
  traceId: string;
  conversationId: string;
  workspaceId: string;
  projectId: string;
  taskClassification: number;
  onToolCall?: (event: ExecutorToolEvent) => void;
  onToolResult?: (event: ExecutorToolEvent) => void;
}

export interface ExecutorOutput {
  answer: string;
  toolCallCount: number;
  hitIterationLimit: boolean;
}

/**
 * Native --jinja tool calling (confirmed working on llm-main in A1's Spike
 * B), with a bounded loop: max_iterations from the agent config, plus this
 * function's own wall-clock guard.
 */
export async function runExecutor(deps: ExecutorDeps, input: ExecutorInput): Promise<ExecutorOutput> {
  const toolDefs = input.agent.toolAllowlist
    .map((name) => TOOL_REGISTRY[name])
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const toolSchemas = toolDefs.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const messages: ChatMessage[] = [{ role: 'system', content: input.systemPrompt }, ...input.messages];
  let toolCallCount = 0;
  // 90s, not the eventual <10s-per-step demo target: confirmed live that
  // CPU-only in-container llm-main (this dev machine — see A1's Spike A)
  // needs two full completions per tool call (the call itself, then the
  // answer synthesis), each of which can take 20-40s on CPU alone. A real
  // GPU box clears the <10s AC comfortably; this is a generous safety
  // bound, not the target.
  const wallClockDeadline = Date.now() + 90_000;

  for (let iteration = 0; iteration < input.agent.maxIterations; iteration++) {
    if (Date.now() > wallClockDeadline) {
      return { answer: 'This took too long and was stopped.', toolCallCount, hitIterationLimit: true };
    }

    const result = await deps.gateway.chat({
      role: input.agent.modelRole,
      messages,
      tools: toolSchemas.length > 0 ? toolSchemas : undefined,
      user: input.user,
      traceId: input.traceId,
    });

    if (result.toolCalls.length === 0) {
      return { answer: result.content, toolCallCount, hitIterationLimit: false };
    }

    messages.push({
      role: 'assistant',
      content: result.content,
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    for (const call of result.toolCalls) {
      toolCallCount++;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.arguments) as Record<string, unknown>;
      } catch {
        // leave args empty — the tool's own validation will report the problem
      }

      input.onToolCall?.({ toolName: call.name, callId: call.id, args });

      const decision = can(input.user, 'tool:invoke', {
        toolName: call.name,
        agentToolAllowlist: input.agent.toolAllowlist,
        taskClassification: input.taskClassification as 0 | 1 | 2 | 3,
      });

      let toolResult: ToolResult;
      const toolDef = TOOL_REGISTRY[call.name];
      if (!decision.allowed) {
        toolResult = { ok: false, summary: decision.reason ?? 'denied', artifactIds: [] };
      } else if (!toolDef) {
        toolResult = { ok: false, summary: `unknown tool "${call.name}"`, artifactIds: [] };
      } else {
        toolResult = await toolDef.execute(args, {
          db: deps.db,
          gateway: deps.gateway,
          spanWriter: deps.spanWriter,
          user: input.user,
          traceId: input.traceId,
          conversationId: input.conversationId,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          sandboxRunnerUrl: deps.sandboxRunnerUrl,
          sandboxSharedSecret: deps.sandboxSharedSecret,
          dataDir: deps.dataDir,
          taskClassification: input.taskClassification,
        });
      }

      input.onToolResult?.({ toolName: call.name, callId: call.id, args, result: toolResult });

      messages.push({ role: 'tool', tool_call_id: call.id, content: toolResult.summary });
    }
  }

  return {
    answer: "I wasn't able to finish this within the allowed number of tool-call steps.",
    toolCallCount,
    hitIterationLimit: true,
  };
}
