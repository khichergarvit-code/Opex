import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { classificationSchema, roleSchema } from '@opex/shared';
import type { Db } from '../db/client.js';
import { approvals, traces } from '../db/schema/index.js';
import type { ChatMessage } from '../models/types.js';
import type { LlamaToolCall } from '../models/llamaClient.js';
import type { ModelGateway, SpanWriter } from '../models/gateway.js';
import { can } from '../policy/can.js';
import type { AuthedUser, PolicyDecision } from '../policy/types.js';
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

export interface ExecutorCallbacks {
  onToolCall?: (event: ExecutorToolEvent) => void;
  onToolResult?: (event: ExecutorToolEvent) => void;
  /** Live text of the model's reply. */
  onToken?: (delta: string) => void;
  /** The reply so far turned out to be a preamble to tool calls — clear it. */
  onDraftReset?: () => void;
}

export interface ExecutorInput extends ExecutorCallbacks {
  agent: AgentConfig;
  systemPrompt: string;
  messages: ChatMessage[];
  user: AuthedUser;
  traceId: string;
  conversationId: string;
  workspaceId: string;
  projectId: string;
  taskClassification: number;
  /** Aborts in-flight model calls when the user presses Stop. */
  signal?: AbortSignal;
}

export interface ExecutorOutcomeOk {
  status: 'ok';
  answer: string;
  toolCallCount: number;
  hitIterationLimit: boolean;
}

export interface ExecutorOutcomeApprovalRequired {
  status: 'approval_required';
  approvalId: string;
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
}

export type ExecutorOutcome = ExecutorOutcomeOk | ExecutorOutcomeApprovalRequired;

interface LoopState {
  messages: ChatMessage[];
  iteration: number;
  toolCallCount: number;
}

interface LoopCtx {
  agent: AgentConfig;
  user: AuthedUser;
  traceId: string;
  conversationId: string;
  workspaceId: string;
  projectId: string;
  taskClassification: number;
  signal?: AbortSignal;
}

const toolCallRequestSchema = z.object({
  id: z.string(),
  type: z.literal('function'),
  function: z.object({ name: z.string(), arguments: z.string() }),
});

const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  tool_calls: z.array(toolCallRequestSchema).optional(),
  tool_call_id: z.string().optional(),
});

const agentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number(),
  description: z.string(),
  systemPromptTemplate: z.string(),
  modelRole: z.enum(['router', 'general', 'coder', 'vision', 'embed', 'rerank']),
  toolAllowlist: z.array(z.string()),
  maxIterations: z.number(),
  requiresApprovalTools: z.array(z.string()),
  enabled: z.boolean(),
  allowedGroups: z.array(z.string()),
});

const pendingCallSchema = z.object({ id: z.string(), name: z.string(), arguments: z.string() });

/**
 * The full paused-loop state persisted to approvals.executor_checkpoint
 * (jsonb) — everything resumeExecutor needs to continue after a real
 * process restart, since tools.md's "pending approvals survive a
 * restart" means a Postgres row, never in-memory state.
 */
const executorCheckpointSchema = z.object({
  agent: agentConfigSchema,
  messages: z.array(chatMessageSchema),
  iteration: z.number(),
  toolCallCount: z.number(),
  pendingCall: pendingCallSchema,
  remainingCalls: z.array(pendingCallSchema),
  user: z.object({
    id: z.string(),
    email: z.string(),
    role: roleSchema,
    clearance: classificationSchema,
    status: z.enum(['active', 'disabled']),
  }),
  traceId: z.string(),
  conversationId: z.string(),
  workspaceId: z.string(),
  projectId: z.string(),
  taskClassification: z.number(),
});

export type ExecutorCheckpoint = z.infer<typeof executorCheckpointSchema>;

/** Validates a jsonb executor_checkpoint column read back from the approvals table. */
export function parseExecutorCheckpoint(raw: unknown): ExecutorCheckpoint {
  return executorCheckpointSchema.parse(raw);
}

/**
 * agents.requiresApprovalTools names a tool that always pauses; code_exec
 * additionally pauses whenever persist=true (writing to the project
 * volume), regardless of the agent's own config.
 */
function needsApproval(agent: AgentConfig, callName: string, args: Record<string, unknown>): boolean {
  return agent.requiresApprovalTools.includes(callName) || (callName === 'code_exec' && args.persist === true);
}

function describeApprovalReason(agent: AgentConfig, callName: string, args: Record<string, unknown>): string {
  if (callName === 'code_exec' && args.persist === true) {
    return 'code_exec requested persist=true, which writes to the project data volume';
  }
  return `the ${agent.name} agent's "${callName}" tool always requires approval`;
}

async function executeOrDeny(
  deps: ExecutorDeps,
  ctx: LoopCtx,
  call: { name: string },
  args: Record<string, unknown>,
  decision: PolicyDecision,
): Promise<ToolResult> {
  const toolDef = TOOL_REGISTRY[call.name];
  if (!decision.allowed) {
    return { ok: false, summary: decision.reason ?? 'denied', artifactIds: [] };
  }
  if (!toolDef) {
    return { ok: false, summary: `unknown tool "${call.name}"`, artifactIds: [] };
  }
  return toolDef.execute(args, {
    db: deps.db,
    gateway: deps.gateway,
    spanWriter: deps.spanWriter,
    user: ctx.user,
    traceId: ctx.traceId,
    conversationId: ctx.conversationId,
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    sandboxRunnerUrl: deps.sandboxRunnerUrl,
    sandboxSharedSecret: deps.sandboxSharedSecret,
    dataDir: deps.dataDir,
    taskClassification: ctx.taskClassification,
  });
}

/**
 * Inserts the approvals row (with the full checkpoint needed to resume)
 * and marks the trace awaiting_approval. Returns the new approval's id.
 */
async function pauseForApproval(
  deps: ExecutorDeps,
  ctx: LoopCtx,
  state: LoopState,
  call: LlamaToolCall,
  args: Record<string, unknown>,
  remainingCalls: LlamaToolCall[],
): Promise<string> {
  const checkpoint: ExecutorCheckpoint = {
    agent: ctx.agent,
    messages: state.messages,
    iteration: state.iteration,
    toolCallCount: state.toolCallCount,
    pendingCall: { id: call.id, name: call.name, arguments: call.arguments },
    remainingCalls: remainingCalls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments })),
    user: ctx.user,
    traceId: ctx.traceId,
    conversationId: ctx.conversationId,
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    taskClassification: ctx.taskClassification,
  };
  const [row] = await deps.db
    .insert(approvals)
    .values({
      traceId: ctx.traceId,
      conversationId: ctx.conversationId,
      requesterId: ctx.user.id,
      agentName: ctx.agent.name,
      toolName: call.name,
      args,
      reason: describeApprovalReason(ctx.agent, call.name, args),
      executorCheckpoint: checkpoint,
    })
    .returning({ id: approvals.id });
  if (!row) {
    throw new Error('failed to insert approvals row');
  }
  await deps.db.update(traces).set({ status: 'awaiting_approval' }).where(eq(traces.id, ctx.traceId));
  return row.id;
}

interface PreparedCall {
  call: LlamaToolCall;
  args: Record<string, unknown>;
  decision: PolicyDecision;
  requiresApproval: boolean;
}

function prepareCall(ctx: LoopCtx, call: LlamaToolCall): PreparedCall {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(call.arguments) as Record<string, unknown>;
  } catch {
    // leave args empty — the tool's own validation will report the problem
  }
  const decision = can(ctx.user, 'tool:invoke', {
    toolName: call.name,
    agentToolAllowlist: ctx.agent.toolAllowlist,
    taskClassification: ctx.taskClassification as 0 | 1 | 2 | 3,
  });
  return { call, args, decision, requiresApproval: decision.allowed && needsApproval(ctx.agent, call.name, args) };
}

/**
 * B3c: every call in the batch that doesn't need a human runs
 * concurrently (each pushes its own tool_call_id-tagged result, so
 * there's no ordering requirement to serialize them just because they
 * arrived in the same model turn). If any call in the batch needs
 * approval, the batch still pauses on the first one — orthogonal to
 * whether its siblings already ran concurrently — deferring any other
 * approval-required calls into the checkpoint, handled one at a time on
 * resume.
 */
async function processToolCalls(
  deps: ExecutorDeps,
  ctx: LoopCtx,
  state: LoopState,
  calls: LlamaToolCall[],
  callbacks: ExecutorCallbacks,
): Promise<ExecutorOutcomeApprovalRequired | null> {
  if (calls.length === 0) return null;

  const prepared = calls.map((call) => prepareCall(ctx, call));
  for (const p of prepared) {
    state.toolCallCount++;
    callbacks.onToolCall?.({ toolName: p.call.name, callId: p.call.id, args: p.args });
  }

  const runNow = prepared.filter((p) => !p.requiresApproval);

  await Promise.allSettled(
    runNow.map(async (p) => {
      const toolResult = await executeOrDeny(deps, ctx, p.call, p.args, p.decision);
      callbacks.onToolResult?.({ toolName: p.call.name, callId: p.call.id, args: p.args, result: toolResult });
      state.messages.push({ role: 'tool', tool_call_id: p.call.id, content: toolResult.summary });
    }),
  );

  const firstApprovalIndex = prepared.findIndex((p) => p.requiresApproval);
  if (firstApprovalIndex === -1) return null;

  const pending = prepared[firstApprovalIndex]!;
  const otherApprovalCalls = prepared.filter((p) => p !== pending && p.requiresApproval).map((p) => p.call);
  const approvalId = await pauseForApproval(deps, ctx, state, pending.call, pending.args, otherApprovalCalls);
  return {
    status: 'approval_required',
    approvalId,
    toolName: pending.call.name,
    args: pending.args,
    reason: describeApprovalReason(ctx.agent, pending.call.name, pending.args),
  };
}

/** Settles the one call a human just decided on — never re-pauses on it. */
async function settlePendingCall(
  deps: ExecutorDeps,
  ctx: LoopCtx,
  state: LoopState,
  pendingCall: { id: string; name: string; arguments: string },
  decision: 'approved' | 'denied',
  callbacks: ExecutorCallbacks,
): Promise<void> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(pendingCall.arguments) as Record<string, unknown>;
  } catch {
    // leave args empty — the tool's own validation will report the problem
  }
  const toolResult: ToolResult =
    decision === 'denied'
      ? { ok: false, summary: 'denied by reviewer', artifactIds: [] }
      : await executeOrDeny(deps, ctx, pendingCall, args, { allowed: true });
  callbacks.onToolResult?.({ toolName: pendingCall.name, callId: pendingCall.id, args, result: toolResult });
  state.messages.push({ role: 'tool', tool_call_id: pendingCall.id, content: toolResult.summary });
}

/**
 * Native --jinja tool calling (confirmed working on llm-main in A1's Spike
 * B), with a bounded loop: max_iterations from the agent config, plus this
 * function's own wall-clock guard. Shared by runExecutor (fresh start) and
 * resumeExecutor (seeded from a checkpoint) — this is the "LoopState
 * while loop" both entry points drive.
 */
async function continueLoop(
  deps: ExecutorDeps,
  ctx: LoopCtx,
  state: LoopState,
  callbacks: ExecutorCallbacks,
): Promise<ExecutorOutcome> {
  const toolDefs = ctx.agent.toolAllowlist
    .map((name) => TOOL_REGISTRY[name])
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const toolSchemas = toolDefs.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  // 90s, not the eventual <10s-per-step demo target: confirmed live that
  // CPU-only in-container llm-main (this dev machine — see A1's Spike A)
  // needs two full completions per tool call (the call itself, then the
  // answer synthesis), each of which can take 20-40s on CPU alone. A real
  // GPU box clears the <10s AC comfortably; this is a generous safety
  // bound, not the target.
  const wallClockDeadline = Date.now() + 90_000;

  while (state.iteration < ctx.agent.maxIterations) {
    if (Date.now() > wallClockDeadline) {
      return { status: 'ok', answer: 'This took too long and was stopped.', toolCallCount: state.toolCallCount, hitIterationLimit: true };
    }

    if (ctx.signal?.aborted) throw new Error('stopped');
    let streamedThisTurn = false;
    const result = await deps.gateway.chat({
      role: ctx.agent.modelRole,
      signal: ctx.signal,
      onToken: callbacks.onToken
        ? (delta) => {
            streamedThisTurn = true;
            callbacks.onToken?.(delta);
          }
        : undefined,
      messages: state.messages,
      tools: toolSchemas.length > 0 ? toolSchemas : undefined,
      user: ctx.user,
      traceId: ctx.traceId,
    });

    if (result.toolCalls.length === 0) {
      return { status: 'ok', answer: result.content, toolCallCount: state.toolCallCount, hitIterationLimit: false };
    }
    // Text streamed before a tool call was only a preamble, not the answer.
    if (streamedThisTurn) callbacks.onDraftReset?.();

    state.messages.push({
      role: 'assistant',
      content: result.content,
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    const outcome = await processToolCalls(deps, ctx, state, result.toolCalls, callbacks);
    if (outcome) return outcome;

    state.iteration++;
  }

  return {
    status: 'ok',
    answer: "I wasn't able to finish this within the allowed number of tool-call steps.",
    toolCallCount: state.toolCallCount,
    hitIterationLimit: true,
  };
}

export async function runExecutor(deps: ExecutorDeps, input: ExecutorInput): Promise<ExecutorOutcome> {
  const state: LoopState = {
    messages: [{ role: 'system', content: input.systemPrompt }, ...input.messages],
    iteration: 0,
    toolCallCount: 0,
  };
  const ctx: LoopCtx = {
    agent: input.agent,
    user: input.user,
    traceId: input.traceId,
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    taskClassification: input.taskClassification,
    signal: input.signal,
  };
  return continueLoop(deps, ctx, state, input);
}

/**
 * Resumes a paused loop from a loaded approvals row's checkpoint. `input`
 * carries only what a checkpoint can't hold — live callback closures tied
 * to the new request's SSE response, since after a real restart those are
 * necessarily fresh.
 */
export async function resumeExecutor(
  deps: ExecutorDeps,
  input: ExecutorCallbacks,
  checkpoint: ExecutorCheckpoint,
  decision: 'approved' | 'denied',
): Promise<ExecutorOutcome> {
  const state: LoopState = {
    messages: [...checkpoint.messages],
    iteration: checkpoint.iteration,
    toolCallCount: checkpoint.toolCallCount,
  };
  const ctx: LoopCtx = {
    agent: checkpoint.agent,
    user: checkpoint.user,
    traceId: checkpoint.traceId,
    conversationId: checkpoint.conversationId,
    workspaceId: checkpoint.workspaceId,
    projectId: checkpoint.projectId,
    taskClassification: checkpoint.taskClassification,
  };

  await settlePendingCall(deps, ctx, state, checkpoint.pendingCall, decision, input);

  const outcome = await processToolCalls(deps, ctx, state, checkpoint.remainingCalls, input);
  if (outcome) return outcome;

  state.iteration++;
  return continueLoop(deps, ctx, state, input);
}
