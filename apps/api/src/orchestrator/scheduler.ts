import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { traces } from '../db/schema/index.js';
import type { ModelGateway, SpanWriter } from '../models/gateway.js';
import type { AuthedUser } from '../policy/types.js';
import { buildDocQaPrompt } from '../routes/docQa.js';
import { answerWithVerification } from './reviseLoop.js';
import { loadAgent, loadAgentSystemPrompt } from './agents.js';
import { runExecutor, type ExecutorCallbacks } from './executor.js';
import type { Plan, PlanStep } from './planner.js';

const CHAT_SYSTEM_PROMPT_PATH = new URL('../prompts/chat-system.md', import.meta.url);
const SYNTHESIS_SYSTEM_PROMPT_PATH = new URL('../prompts/synthesis-system.md', import.meta.url);

export interface RunPlanDeps {
  db: Db;
  gateway: ModelGateway;
  spanWriter: SpanWriter;
  sandboxRunnerUrl: string;
  sandboxSharedSecret: string;
  dataDir: string;
  user: AuthedUser;
  traceId: string;
  conversationId: string;
  workspaceId: string;
  projectId: string;
  taskClassification: number;
  signal?: AbortSignal;
}

export interface RunPlanCallbacks extends ExecutorCallbacks {
  onStepStart?: (step: PlanStep) => void;
  /** Fires right before the final answer is written (its text streams through onToken). */
  onSynthesisStart?: () => void;
}

interface StepResult {
  id: string;
  agent: string;
  output: string;
}

function renderStepOutputBlock(result: StepResult): string {
  // Same invariant-#5 treatment as memory/chunks — a labeled block in the
  // user turn, regardless of provenance, since an upstream step's output
  // is exactly the kind of dynamically-assembled content that rule covers.
  return `<step_output id="${result.id}" agent="${result.agent}">\n${result.output}\n</step_output>`;
}

async function runStep(deps: RunPlanDeps, step: PlanStep, results: Map<string, StepResult>, callbacks: RunPlanCallbacks): Promise<string> {
  const upstreamBlocks = step.inputsFrom
    .map((id) => results.get(id))
    .filter((r): r is StepResult => Boolean(r))
    .map(renderStepOutputBlock)
    .join('\n\n');
  const userTurn = upstreamBlocks ? `${upstreamBlocks}\n\nGoal: ${step.goal}` : `Goal: ${step.goal}`;

  if (step.agent === 'doc_qa') {
    const docQa = await buildDocQaPrompt({
      db: deps.db,
      gateway: deps.gateway,
      spanWriter: deps.spanWriter,
      user: deps.user,
      traceId: deps.traceId,
      workspaceId: deps.workspaceId,
      projectId: deps.projectId,
      priorTurns: [],
      question: step.goal,
    });
    if (docQa.noSupportAnswer) return docQa.noSupportAnswer;
    const messages = [...docQa.messages];
    const last = messages[messages.length - 1];
    if (upstreamBlocks && last) messages[messages.length - 1] = { ...last, content: `${upstreamBlocks}\n\n${last.content}` };
    const validMarkers = new Set(docQa.citationMap.map((c) => c.marker));
    const verification = await answerWithVerification(
      { gateway: deps.gateway, user: deps.user, traceId: deps.traceId },
      docQa.systemPrompt,
      messages,
      docQa.citedChunks,
      validMarkers,
      { signal: deps.signal },
    );
    return verification.answer;
  }

  const agentConfig = step.agent === 'general' ? null : await loadAgent(deps.db, step.agent);
  if (!agentConfig) {
    const systemPrompt = await readFile(CHAT_SYSTEM_PROMPT_PATH, 'utf8');
    const result = await deps.gateway.chat({
      role: 'general',
      signal: deps.signal,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userTurn },
      ],
      user: deps.user,
      traceId: deps.traceId,
    });
    return result.content;
  }

  const systemPrompt = await loadAgentSystemPrompt(agentConfig);
  // A step gets its own trace, not the turn's top-level one: if it pauses
  // for approval, that pause (and pauseForApproval's own traces.status
  // write) stays scoped to this step rather than fighting with the
  // top-level turn's trace, which finalizes independently once the plan
  // completes (see the Debt note below on why a pause isn't otherwise
  // resolved within this plan run).
  const [stepTrace] = await deps.db.insert(traces).values({ userId: deps.user.id, conversationId: deps.conversationId }).returning();
  if (!stepTrace) throw new Error('failed to open a trace for plan step ' + step.id);
  const outcome = await runExecutor(
    {
      db: deps.db,
      gateway: deps.gateway,
      spanWriter: deps.spanWriter,
      sandboxRunnerUrl: deps.sandboxRunnerUrl,
      sandboxSharedSecret: deps.sandboxSharedSecret,
      dataDir: deps.dataDir,
    },
    {
      agent: agentConfig,
      systemPrompt,
      messages: [{ role: 'user', content: userTurn }],
      user: deps.user,
      traceId: stepTrace.id,
      conversationId: deps.conversationId,
      workspaceId: deps.workspaceId,
      projectId: deps.projectId,
      taskClassification: deps.taskClassification,
      signal: deps.signal,
      onToolCall: callbacks.onToolCall,
      onToolResult: callbacks.onToolResult,
    },
  );
  if (outcome.status === 'approval_required') {
    // Debt, flagged not silently resolved: a step pausing for approval
    // mid-plan doesn't get a plan-level checkpoint this pass (the
    // recommended design is one alongside the approval row so unrelated
    // steps in the same wave keep running and only this step re-enters
    // on resume) — neither AC's literal text requires that combination,
    // and it isn't exercised live. The approval row is real and stays
    // pending (or times out to denied) on its own step-scoped trace;
    // this step's output is left as a visible, explained gap in the
    // synthesis rather than silently dropped or retried.
    return `[This step needs human approval to run "${outcome.toolName}" (${outcome.reason}) — not resolved within this plan run. See the Approvals page.]`;
  }
  await deps.db.update(traces).set({ status: 'ok', endedAt: new Date() }).where(eq(traces.id, stepTrace.id));
  return outcome.answer;
}

/**
 * orchestration.md, B3: independent steps run concurrently; outputs pass
 * between steps as labeled blocks; the general agent always writes the
 * final synthesis (never just the last step's raw answer).
 */
export async function runPlan(deps: RunPlanDeps, plan: Plan, originalMessage: string, callbacks: RunPlanCallbacks = {}): Promise<string> {
  const results = new Map<string, StepResult>();
  const remaining = new Set(plan.steps.map((s) => s.id));

  while (remaining.size > 0) {
    let ready = plan.steps.filter((s) => remaining.has(s.id) && s.inputsFrom.every((id) => results.has(id)));
    if (ready.length === 0) {
      // Unsatisfiable dependency (a cycle, or inputs_from naming an id
      // that isn't in the plan) — fail-safe: run everything remaining
      // rather than looping forever.
      ready = plan.steps.filter((s) => remaining.has(s.id));
    }
    await Promise.all(
      ready.map(async (step) => {
        callbacks.onStepStart?.(step);
        const output = await runStep(deps, step, results, callbacks);
        results.set(step.id, { id: step.id, agent: step.agent, output });
        remaining.delete(step.id);
      }),
    );
  }

  const stepBlocks = plan.steps
    .map((s) => results.get(s.id))
    .filter((r): r is StepResult => Boolean(r))
    .map(renderStepOutputBlock)
    .join('\n\n');
  const synthesisSystemPrompt = await readFile(SYNTHESIS_SYSTEM_PROMPT_PATH, 'utf8');
  callbacks.onSynthesisStart?.();
  const synthesis = await deps.gateway.chat({
    role: 'general',
    signal: deps.signal,
    onToken: callbacks.onToken,
    messages: [
      { role: 'system', content: synthesisSystemPrompt },
      { role: 'user', content: `${stepBlocks}\n\nOriginal request: ${originalMessage}` },
    ],
    user: deps.user,
    traceId: deps.traceId,
  });
  return synthesis.content;
}
