import { createAccessRequestSchema, decideAccessRequestSchema } from '@opex/shared';
import { and, desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import type { Db } from '../db/client.js';
import { accessGrants, accessRequests, users } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import { inScopeUsers, sameWorkspace } from '../policy/scope.js';
import type { AuditWriter } from '../audit/writeAudit.js';

/**
 * security.md's "a user submits a request with a reason; an admin
 * approves it with an expiry, which creates an access_grants row that
 * retrieval honors until it expires" flow. Retrieval's aclFilter.ts
 * already reads access_grants — no retrieval-side changes needed here.
 */
export function createAccessRequestsRouter(db: Db, auditWriter: AuditWriter): Router {
  const router = Router();

  router.post('/access-requests', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const parsed = createAccessRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    const decision = can(user, 'access_request:create', { documentId: parsed.data.documentId });
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const [row] = await db
      .insert(accessRequests)
      .values({ documentId: parsed.data.documentId, userId: user.id, reason: parsed.data.reason })
      .returning();
    await auditWriter.writeAudit({
      actorId: user.id,
      action: 'access_request.create',
      resource: parsed.data.documentId,
      details: { requestId: row!.id, reason: parsed.data.reason },
    });
    res.status(201).json(row);
  });

  router.get('/admin/access-requests', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const decision = can(user, 'access_grant:read');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const rows = await db
      .select()
      .from(accessRequests)
      .where(and(status ? eq(accessRequests.status, status as 'pending' | 'approved' | 'denied') : undefined, inScopeUsers(user, accessRequests.userId)))
      .orderBy(desc(accessRequests.createdAt));
    res.json(rows);
  });

  router.post('/access-requests/:id/decide', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const requestId = req.params.id as string;
    const parsed = decideAccessRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    const decision = can(user, 'access_request:approve');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }

    const [reqRow] = await db.select().from(accessRequests).where(eq(accessRequests.id, requestId)).limit(1);
    const [requester] = reqRow ? await db.select({ workspaceId: users.workspaceId }).from(users).where(eq(users.id, reqRow.userId)).limit(1) : [];
    if (!reqRow || !requester || !sameWorkspace(user, requester.workspaceId)) {
      res.status(404).json({ error: 'access request not found' });
      return;
    }

    const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
    const status = parsed.data.decision;

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(accessRequests)
        .set({ status, decidedBy: user.id, decidedAt: new Date(), expiresAt })
        .where(eq(accessRequests.id, requestId))
        .returning();
      if (status === 'approved') {
        await tx.insert(accessGrants).values({
          documentId: reqRow.documentId,
          userId: reqRow.userId,
          grantedBy: user.id,
          expiresAt,
        });
      }
      return row;
    });

    await auditWriter.writeAudit({
      actorId: user.id,
      action: status === 'approved' ? 'access_request.approve' : 'access_request.deny',
      resource: requestId,
      details: { documentId: reqRow.documentId, targetUserId: reqRow.userId, expiresAt: parsed.data.expiresAt ?? null },
    });

    res.json(updated);
  });

  return router;
}
