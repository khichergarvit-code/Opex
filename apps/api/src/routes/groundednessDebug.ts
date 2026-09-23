import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { traces } from '../db/schema/index.js';
import type { ModelGateway } from '../models/gateway.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { verifyGroundedness } from '../orchestrator/groundedness.js';

const groundednessDebugRequestSchema = z.object({
  answerText: z.string().min(1),
  citedChunks: z.array(z.object({ marker: z.number(), text: z.string() })),
  validMarkers: z.array(z.number()),
});

/**
 * Exposes verifyGroundedness() directly, for eval/suites/groundedness.ts —
 * same reasoning as routerDebug.ts: not project-scoped, so no resource-
 * access decision applies here for can() to make.
 */
export function createGroundednessDebugRouter(db: Db, gateway: ModelGateway): Router {
  const router = Router();

  router.post('/groundedness-debug', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const parsed = groundednessDebugRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }

    const [trace] = await db.insert(traces).values({ userId: user.id }).returning();
    if (!trace) throw new Error('failed to open trace');

    const result = await verifyGroundedness(
      { gateway, user, traceId: trace.id },
      parsed.data.answerText,
      parsed.data.citedChunks,
      new Set(parsed.data.validMarkers),
    );
    res.json(result);
  });

  return router;
}
