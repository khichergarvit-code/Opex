import { and, desc, eq, isNull } from 'drizzle-orm';
import { Router } from 'express';
import type { Db } from '../db/client.js';
import { memories } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';

/**
 * Self-service counterpart to adminMemory.ts's /admin/memory/long-term —
 * scoped strictly to req.user!.id, no admin role required. A plain
 * ownership filter is correct here (not memoryAclFilter.ts's ACL helper,
 * which is for retrieval-time candidate expansion across scopes for a
 * *different* user's query context) — this route wants exactly and only
 * the caller's own rows, matching ui.md's "What OpeX remembers" panel.
 */
export function createMemoryRouter(db: Db): Router {
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

  return router;
}
