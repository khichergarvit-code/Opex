import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { auditLog, conversations, messages, spans, traces, users } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import type { AuditWriter } from '../audit/writeAudit.js';

// Empty strings (an unselected filter) mean "no filter".
const blankToUndefined = (v: unknown) => (v === '' || v === 'undefined' ? undefined : v);

const logsQuerySchema = z.object({
  kind: z.preprocess(blankToUndefined, z.enum(['llm', 'retrieval', 'memory', 'tool', 'policy']).optional()),
  status: z.preprocess(blankToUndefined, z.enum(['ok', 'error']).optional()),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const auditQuerySchema = z.object({
  action: z.string().optional(),
  actorId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Read-only admin views of traces and usage (A3 — ui.md's Admin §A3 row; B1/B5 add the rest). */
export function createAdminRouter(db: Db, auditWriter: AuditWriter): Router {
  const router = Router();

  router.get('/admin/logs', requireAuth(db), async (req, res) => {
    const decision = can(req.user!, 'admin:traces:read');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const parsed = logsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid query params' });
      return;
    }
    const { kind, status, limit } = parsed.data;
    const conditions = [
      kind ? eq(spans.kind, kind) : undefined,
      status ? eq(spans.status, status) : undefined,
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));

    const rows = await db
      .select()
      .from(spans)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(spans.createdAt))
      .limit(limit);
    res.json(rows);
  });

  router.get('/admin/usage', requireAuth(db), async (req, res) => {
    const decision = can(req.user!, 'admin:usage:read');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days

    // Tokens per user/model/day. dailyTokenQuota is unused (A1 Decision) —
    // this shows raw totals only, no burn-down comparison (see the plan's §10).
    const rows = await db
      .select({
        userId: traces.userId,
        userEmail: users.email,
        model: spans.model,
        day: sql<string>`date_trunc('day', ${spans.createdAt})::date`,
        tokensIn: sql<number>`coalesce(sum(${spans.tokensIn}), 0)`,
        tokensOut: sql<number>`coalesce(sum(${spans.tokensOut}), 0)`,
        callCount: sql<number>`count(*)`,
      })
      .from(spans)
      .innerJoin(traces, eq(spans.traceId, traces.id))
      .innerJoin(users, eq(traces.userId, users.id))
      .where(and(eq(spans.kind, 'llm'), gte(spans.createdAt, since)))
      .groupBy(traces.userId, users.email, spans.model, sql`date_trunc('day', ${spans.createdAt})`)
      .orderBy(desc(sql`date_trunc('day', ${spans.createdAt})`));

    res.json(rows);
  });

  router.get('/admin/conversations', requireAuth(db), async (req, res) => {
    const decision = can(req.user!, 'admin:conversation:read');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const rows = await db
      .select({
        id: conversations.id,
        userId: conversations.userId,
        userEmail: users.email,
        projectId: conversations.projectId,
        title: conversations.title,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .innerJoin(users, eq(conversations.userId, users.id))
      .where(userId ? eq(conversations.userId, userId) : undefined)
      .orderBy(desc(conversations.updatedAt))
      .limit(100);
    res.json(rows);
  });

  // ui.md's Admin section: "chat history (viewing it is audited)" — every
  // successful fetch here writes an audit entry, since this is an admin
  // reading another user's private conversation.
  // Deleting someone else's conversation is a write action on private data: policy-write admins only, always audited.
  router.delete('/admin/conversations/:id', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const decision = can(user, 'admin:policies:write');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const id = req.params.id as string;
    const [row] = await db.select({ id: conversations.id, userId: conversations.userId }).from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!row) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    await db.delete(conversations).where(eq(conversations.id, id));
    await auditWriter.writeAudit({ actorId: user.id, action: 'conversation.admin_delete', resource: id, details: { ownerId: row.userId } });
    res.json({ deleted: 1 });
  });

  router.get('/admin/conversations/:id/messages', requireAuth(db), async (req, res) => {
    const admin = req.user!;
    const conversationId = req.params.id as string;
    const decision = can(admin, 'admin:conversation:read');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
    if (!conversation) {
      res.status(404).json({ error: 'conversation not found' });
      return;
    }
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
    await auditWriter.writeAudit({
      actorId: admin.id,
      action: 'admin.conversation.view',
      resource: conversationId,
      details: { targetUserId: conversation.userId },
    });
    res.json(rows);
  });

  router.get('/admin/audit', requireAuth(db), async (req, res) => {
    const decision = can(req.user!, 'admin:audit:read');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const parsed = auditQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid query params' });
      return;
    }
    const { action, actorId, limit } = parsed.data;
    const conditions = [
      action ? eq(auditLog.action, action) : undefined,
      actorId ? eq(auditLog.actorId, actorId) : undefined,
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));

    const rows = await db
      .select({
        id: auditLog.id,
        ts: auditLog.ts,
        actorId: auditLog.actorId,
        actorEmail: users.email,
        action: auditLog.action,
        resource: auditLog.resource,
        details: auditLog.details,
        prevHash: auditLog.prevHash,
        hash: auditLog.hash,
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.actorId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLog.ts))
      .limit(limit);
    res.json(rows);
  });

  return router;
}
