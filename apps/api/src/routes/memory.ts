import { and, desc, eq, isNull } from 'drizzle-orm';
import { Router } from 'express';
import type { Db } from '../db/client.js';
import { memories } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import type { AuditWriter } from '../audit/writeAudit.js';

/**
 * Self-service counterpart to adminMemory.ts's /admin/memory/long-term —
 * scoped strictly to req.user!.id, no admin role required. A plain
 * ownership filter is correct here (not memoryAclFilter.ts's ACL helper,
 * which is for retrieval-time candidate expansion across scopes for a
 * *different* user's query context) — this route wants exactly and only
 * the caller's own rows, matching ui.md's "What OpeX remembers" panel.
 */
export function createMemoryRouter(db: Db, auditWriter?: AuditWriter): Router {
  const router = Router();

  router.get('/memory/mine', requireAuth(db), async (req, res) => {
    const rows = await db
      .select({
        id: memories.id,
        type: memories.type,
        scope: memories.scope,
        text: memories.text,
        confidence: memories.confidence,
        classification: memories.classification,
        createdAt: memories.createdAt,
      })
      .from(memories)
      .where(and(eq(memories.userId, req.user!.id), isNull(memories.deletedAt)))
      .orderBy(desc(memories.createdAt));
    res.json(rows);
  });

  // Forget one memory of your own (also the "Forget" button on the "Remembered…" notice).
  router.delete('/memory/mine/:id', requireAuth(db), async (req, res) => {
    const id = req.params.id as string;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const rows = await db
      .update(memories)
      .set({ deletedAt: new Date() })
      .where(and(eq(memories.id, id), eq(memories.userId, req.user!.id), isNull(memories.deletedAt)))
      .returning({ id: memories.id });
    if (rows.length === 0) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    await auditWriter?.writeAudit({ actorId: req.user!.id, action: 'memory.forget', resource: id });
    res.json({ ok: true });
  });

  // Forget everything OpeX has learned about you.
  router.delete('/memory/mine', requireAuth(db), async (req, res) => {
    const rows = await db
      .update(memories)
      .set({ deletedAt: new Date() })
      .where(and(eq(memories.userId, req.user!.id), isNull(memories.deletedAt)))
      .returning({ id: memories.id });
    await auditWriter?.writeAudit({ actorId: req.user!.id, action: 'memory.forget_all', resource: req.user!.id, details: { count: rows.length } });
    res.json({ forgotten: rows.length });
  });

  return router;
}
