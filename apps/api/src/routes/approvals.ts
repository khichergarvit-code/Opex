import { desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { decideApprovalSchema } from '@opex/shared';
import type { Db } from '../db/client.js';
import { approvals } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import type { AuditWriter } from '../audit/writeAudit.js';
import type { ModelGateway, SpanWriter } from '../models/gateway.js';
import { settleApproval } from '../orchestrator/settleApproval.js';
import type { Env } from '../env.js';

/**
 * tools.md's B4 approvals flow: list pending (own + admin oversight) and
 * decide. Mirrors accessRequests.ts's request/decide shape. Deciding
 * resumes the paused executor loop and runs the same finalization
 * conversations.ts does after a normal run — see settleApproval.ts.
 */
export function createApprovalsRouter(db: Db, gateway: ModelGateway, spanWriter: SpanWriter, auditWriter: AuditWriter, env: Env): Router {
  const router = Router();

  router.get('/approvals/pending', requireAuth(db), async (req, res) => {
    const user = req.user!;
    // Reuses approval:decide's own gate (no approvalRequesterId — allowed
    // only for super_admin/workspace_admin) to decide the query scope,
    // rather than inventing a separate read Action for this one branch.
    const isAdmin = can(user, 'approval:decide', {}).allowed;
    const rows = await db
      .select()
      .from(approvals)
      .where(eq(approvals.status, 'pending'))
      .orderBy(desc(approvals.createdAt));
    res.json(isAdmin ? rows : rows.filter((r) => r.requesterId === user.id));
  });

  router.get('/admin/approvals', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const decision = can(user, 'approval:decide', {});
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const rows = await db
      .select()
      .from(approvals)
      .where(status ? eq(approvals.status, status as 'pending' | 'approved' | 'denied') : undefined)
      .orderBy(desc(approvals.createdAt));
    res.json(rows);
  });

  router.post('/approvals/:id/decide', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const approvalId = req.params.id as string;
    const parsed = decideApprovalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }

    const [row] = await db.select().from(approvals).where(eq(approvals.id, approvalId)).limit(1);
    if (!row) {
      res.status(404).json({ error: 'approval not found' });
      return;
    }
    if (row.status !== 'pending') {
      res.status(409).json({ error: 'approval was already decided' });
      return;
    }

    const decision = can(user, 'approval:decide', { approvalRequesterId: row.requesterId });
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }

    const result = await settleApproval(
      { db, gateway, spanWriter, sandboxRunnerUrl: env.SANDBOX_RUNNER_URL, sandboxSharedSecret: env.SANDBOX_SHARED_SECRET, dataDir: env.DATA_DIR },
      row,
      parsed.data.decision,
      user.id,
    );

    await auditWriter.writeAudit({
      actorId: user.id,
      action: parsed.data.decision === 'approved' ? 'approval.approve' : 'approval.deny',
      resource: approvalId,
      details: { toolName: row.toolName, conversationId: row.conversationId, resultStatus: result.status },
    });

    res.json({ approvalId, ...result });
  });

  return router;
}
