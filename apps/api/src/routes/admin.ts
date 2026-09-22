import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { spans, traces, users } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';

const logsQuerySchema = z.object({
  kind: z.enum(['llm', 'retrieval', 'memory', 'tool', 'policy']).optional(),
  status: z.enum(['ok', 'error']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Read-only admin views of traces and usage (A3 — ui.md's Admin §A3 row; B1/B5 add the rest). */
export function createAdminRouter(db: Db): Router {
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

  return router;
}
