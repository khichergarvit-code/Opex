import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { models } from '../db/schema/index.js';
import { pingHealth } from '../models/health.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import type { AuditWriter } from '../audit/writeAudit.js';

const patchModelSchema = z.object({
  enabled: z.boolean().optional(),
  groupAllowlist: z.array(z.string().uuid()).optional(),
});

/** ui.md's Admin §B5: "Models and tools: status, VRAM, license and origin, an enable toggle, and a group allowlist." */
export function createAdminModelsRouter(db: Db, auditWriter: AuditWriter): Router {
  const router = Router();

  router.get('/admin/models', requireAuth(db), async (req, res) => {
    const decision = can(req.user!, 'admin:models:manage');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const rows = await db.select().from(models).orderBy(models.role, models.id);
    const withStatus = await Promise.all(
      rows.map(async (m) => ({
        ...m,
        status: await pingHealth(m.endpoint),
        // vramMb is the static value seeded from the manifest at boot, not
        // a live reading — this stack is CPU-only, so there's no live VRAM
        // to report (see docs/PROGRESS.md's Decisions).
        vramLive: 'not applicable — CPU-only stack',
      })),
    );
    res.json(withStatus);
  });

  router.patch('/admin/models/:id', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const modelId = req.params.id as string;
    const decision = can(user, 'admin:models:manage');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const parsed = patchModelSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    const [row] = await db
      .update(models)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(models.id, modelId))
      .returning();
    if (!row) {
      res.status(404).json({ error: 'model not found' });
      return;
    }
    await auditWriter.writeAudit({ actorId: user.id, action: 'model.update', resource: modelId, details: parsed.data });
    res.json(row);
  });

  return router;
}
