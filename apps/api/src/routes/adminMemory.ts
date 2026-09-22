import { desc, eq, isNotNull } from 'drizzle-orm';
import { Router } from 'express';
import type { Db } from '../db/client.js';
import { conversations, users } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import type { AuditWriter } from '../audit/writeAudit.js';

/**
 * ui.md's Admin §B5 "Memory" is scoped to what actually exists today:
 * A3's per-conversation rolling working_summary. B2's long-term,
 * cross-conversation memory store isn't built yet, so this deliberately
 * does NOT show fabricated TTLs/purge-counts/per-user cross-conversation
 * data — see docs/PROGRESS.md.
 */
export function createAdminMemoryRouter(db: Db, auditWriter: AuditWriter): Router {
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

  return router;
}
