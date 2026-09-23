import { desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { conversations, memories, policies, users } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import { policyRulesSchema } from '../policy/rules.js';
import type { ModelGateway, SpanWriter } from '../models/gateway.js';
import { runExtractionForConversation } from '../memory/extraction.js';
import type { AuditWriter } from '../audit/writeAudit.js';

const putTtlSchema = z.object({
  workspaceId: z.string().uuid(),
  memoryTtlDays: z.object({ episodic: z.number().nullable(), semantic: z.number().nullable() }),
});

/**
 * B2 extends this beyond A3's per-conversation working_summary (kept
 * below, unchanged) with the real long-term memory store: list/delete/
 * TTL routes, plus a debug extraction trigger so admins/evals don't have
 * to wait for the real 30-minute idle threshold.
 */
export function createAdminMemoryRouter(db: Db, gateway: ModelGateway, spanWriter: SpanWriter, auditWriter: AuditWriter): Router {
  const router = Router();

  router.get('/admin/memory', requireAuth(db), async (req, res) => {
    const decision = can(req.user!, 'admin:memory:read');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const rows = await db
      .select({
        id: conversations.id,
        userId: conversations.userId,
        userEmail: users.email,
        summaryLength: conversations.workingSummary,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .innerJoin(users, eq(conversations.userId, users.id))
      .where(isNotNull(conversations.workingSummary))
      .orderBy(desc(conversations.updatedAt));
    res.json(
      rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userEmail: r.userEmail,
        summaryLength: r.summaryLength?.length ?? 0,
        updatedAt: r.updatedAt,
      })),
    );
  });

  router.post('/admin/memory/:id/purge', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const conversationId = req.params.id as string;
    const decision = can(user, 'admin:memory:purge');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const [row] = await db
      .update(conversations)
      .set({ workingSummary: null, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId))
      .returning({ id: conversations.id });
    if (!row) {
      res.status(404).json({ error: 'conversation not found' });
      return;
    }
    await auditWriter.writeAudit({ actorId: user.id, action: 'memory.purge', resource: conversationId });
    res.status(204).end();
  });

  router.get('/admin/memory/long-term', requireAuth(db), async (req, res) => {
    const decision = can(req.user!, 'admin:memory:read');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const rows = await db
      .select({
        id: memories.id,
        userId: memories.userId,
        userEmail: users.email,
        type: memories.type,
        scope: memories.scope,
        text: memories.text,
        confidence: memories.confidence,
        classification: memories.classification,
        sourceKind: memories.sourceKind,
        accessCount: memories.accessCount,
        createdAt: memories.createdAt,
      })
      .from(memories)
      .innerJoin(users, eq(memories.userId, users.id))
      .where(isNull(memories.deletedAt))
      .orderBy(desc(memories.createdAt));
    res.json(rows);
  });

  router.delete('/admin/memory/long-term/:id', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const memoryId = req.params.id as string;
    const [row] = await db.select({ userId: memories.userId }).from(memories).where(eq(memories.id, memoryId)).limit(1);
    if (!row) {
      res.status(404).json({ error: 'memory not found' });
      return;
    }
    const decision = can(user, 'admin:memory:purge', { memoryOwnerId: row.userId });
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    await db.update(memories).set({ deletedAt: new Date() }).where(eq(memories.id, memoryId));
    await auditWriter.writeAudit({ actorId: user.id, action: 'memory.delete', resource: memoryId });
    res.status(204).end();
  });

  router.put('/admin/memory/ttl', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const decision = can(user, 'admin:policies:write');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const parsed = putTtlSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    const [existing] = await db.select().from(policies).where(eq(policies.workspaceId, parsed.data.workspaceId)).limit(1);
    const rules = existing ? policyRulesSchema.parse(existing.rules) : policyRulesSchema.parse({});
    const updatedRules = { ...rules, memoryTtlDays: parsed.data.memoryTtlDays };
    if (existing) {
      await db.update(policies).set({ rules: updatedRules, updatedAt: new Date() }).where(eq(policies.id, existing.id));
    } else {
      await db.insert(policies).values({ workspaceId: parsed.data.workspaceId, name: 'default', rules: updatedRules });
    }
    await auditWriter.writeAudit({ actorId: user.id, action: 'memory.ttl.update', resource: parsed.data.workspaceId, details: parsed.data.memoryTtlDays });
    res.json(updatedRules);
  });

  // Debug/eval-only: trigger extraction now instead of waiting for the
  // real 30-minute idle threshold. Reuses admin:memory:read's gate since
  // it's a read-adjacent diagnostic action, not a new capability.
  router.post('/admin/memory/extract-now/:conversationId', requireAuth(db), async (req, res) => {
    const decision = can(req.user!, 'admin:memory:read');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    await runExtractionForConversation({ db, gateway, spanWriter }, req.params.conversationId as string);
    res.status(204).end();
  });

  return router;
}
