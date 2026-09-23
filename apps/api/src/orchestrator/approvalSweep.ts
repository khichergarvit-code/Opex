import { and, eq, lt } from 'drizzle-orm';
import { approvals } from '../db/schema/index.js';
import { settleApproval, type SettleApprovalDeps } from './settleApproval.js';

// tools.md only says "a timeout counts as a denial," with no specific
// duration — this default gives a human a reasonable window to notice
// and decide before the paused task is auto-denied.
const APPROVAL_TIMEOUT_MINUTES = 60;

export async function sweepTimedOutApprovals(deps: SettleApprovalDeps): Promise<void> {
  const cutoff = new Date(Date.now() - APPROVAL_TIMEOUT_MINUTES * 60_000);
  const timedOut = await deps.db
    .select()
    .from(approvals)
    .where(and(eq(approvals.status, 'pending'), lt(approvals.createdAt, cutoff)));

  for (const row of timedOut) {
    await settleApproval(deps, row, 'denied', null).catch((err) => {
      console.error('approval timeout sweep failed for', row.id, err);
    });
  }
}

/**
 * In-process interval, same reasoning as memory/scheduler.ts's
 * startMemoryScheduler: the workload is too light to justify a
 * dedicated worker container.
 */
export function startApprovalTimeoutSweep(deps: SettleApprovalDeps, intervalMs = 5 * 60_000): () => void {
  const interval = setInterval(() => {
    sweepTimedOutApprovals(deps).catch((err) => console.error('approval sweep tick failed:', err));
  }, intervalMs);
  return () => clearInterval(interval);
}
