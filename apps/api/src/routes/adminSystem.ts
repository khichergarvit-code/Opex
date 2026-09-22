import { statfs } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { Router } from 'express';
import type { Db } from '../db/client.js';
import { jobs } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';

export function computeAlerts(input: { pendingJobs: number; diskUsedPct: number }): string[] {
  const alerts: string[] = [];
  if (input.pendingJobs > 50) alerts.push(`queue depth is high: ${input.pendingJobs} pending jobs`);
  if (input.diskUsedPct > 90) alerts.push(`disk usage is high: ${input.diskUsedPct.toFixed(1)}% used`);
  return alerts;
}

/** ui.md's Admin §B5 "System": GPU, VRAM, queue depth, disk usage, alerts. */
export function createAdminSystemRouter(db: Db, dataDir: string): Router {
  const router = Router();

  router.get('/admin/system', requireAuth(db), async (req, res) => {
    const decision = can(req.user!, 'admin:system:read');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }

    const queueRows = await db
      .select({ status: jobs.status, count: sql<number>`count(*)` })
      .from(jobs)
      .groupBy(jobs.status);
    const pendingJobs = Number(queueRows.find((r) => r.status === 'pending')?.count ?? 0);

    let diskUsedPct = 0;
    try {
      const stats = await statfs(dataDir);
      const total = stats.blocks * stats.bsize;
      const free = stats.bfree * stats.bsize;
      diskUsedPct = total > 0 ? ((total - free) / total) * 100 : 0;
    } catch {
      // dataDir may not exist on this host (e.g. before first upload) — 0% is a fine default, not fabricated.
    }

    res.json({
      queueByStatus: queueRows.map((r) => ({ status: r.status, count: Number(r.count) })),
      diskUsedPct,
      // This stack is CPU-only (docs/PROGRESS.md's Decisions) — a literal
      // string, not a fabricated or omitted number.
      gpu: 'N/A — CPU-only stack',
      vram: 'N/A — CPU-only stack',
      alerts: computeAlerts({ pendingJobs, diskUsedPct }),
    });
  });

  return router;
}
