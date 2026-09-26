import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { approvals, artifacts, messages, traces } from '../db/schema/index.js';
import type { ModelGateway, SpanWriter } from '../models/gateway.js';
import { parseExecutorCheckpoint, resumeExecutor, type ExecutorOutcome } from './executor.js';

export interface ApprovalRow {
  id: string;
  traceId: string;
  conversationId: string;
  requesterId: string;
  executorCheckpoint: unknown;
}

export interface SettleApprovalDeps {
  db: Db;
  gateway: ModelGateway;
  spanWriter: SpanWriter;
  sandboxRunnerUrl: string;
  sandboxSharedSecret: string;
  dataDir: string;
}

export interface SettleApprovalResult {
  status: ExecutorOutcome['status'] | 'error';
  messageId?: string;
  answer?: string;
  /** Files/images the resumed tool call created, shown with the answer. */
  attachments?: Array<{ id: string; filename: string; mime: string }>;
  /** Set only when status is 'approval_required' — a NEW, nested approval. */
  approvalId?: string;
}

/**
 * Shared by the approvals route's POST /approvals/:id/decide and the
 * timeout-as-denial sweep — resumes the paused executor loop and runs
 * the exact same finalization conversations.ts does after a normal
 * runExecutor 'ok' return (insert the assistant message, update the
 * trace status), so a resumed call finishes identically to a same-turn
 * one, whether decided by a human or a timeout.
 */
export async function settleApproval(
  deps: SettleApprovalDeps,
  row: ApprovalRow,
  decision: 'approved' | 'denied',
  decidedBy: string | null,
): Promise<SettleApprovalResult> {
  const checkpoint = parseExecutorCheckpoint(row.executorCheckpoint);

  await deps.db
    .update(approvals)
    .set({ status: decision, decidedBy, decidedAt: new Date() })
    .where(eq(approvals.id, row.id));

  let outcome: ExecutorOutcome;
  try {
    outcome = await resumeExecutor(deps, {}, checkpoint, decision);
  } catch {
    await deps.db.update(traces).set({ status: 'error', endedAt: new Date() }).where(eq(traces.id, row.traceId));
    return { status: 'error' };
  }

  if (outcome.status === 'approval_required') {
    // A different call in the same batch also needs approval —
    // pauseForApproval already inserted its own approvals row and
    // re-set traces.status to awaiting_approval. Nothing else to do.
    return { status: 'approval_required', approvalId: outcome.approvalId };
  }

  const attachments = await deps.db
    .select({ id: artifacts.id, filename: artifacts.filename, mime: artifacts.mime })
    .from(artifacts)
    .where(eq(artifacts.traceId, row.traceId));
  const [assistantRow] = await deps.db
    .insert(messages)
    .values({ conversationId: row.conversationId, role: 'assistant', content: outcome.answer, traceId: row.traceId, citations: [], attachments })
    .returning();
  await deps.db.update(traces).set({ status: 'ok', endedAt: new Date() }).where(eq(traces.id, row.traceId));
  return { status: 'ok', messageId: assistantRow?.id, answer: outcome.answer, attachments };
}
