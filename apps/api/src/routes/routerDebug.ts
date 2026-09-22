import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { projectMembers, traces } from '../db/schema/index.js';
import type { ModelGateway } from '../models/gateway.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import { projectHasReadyDocuments } from './docQa.js';
import { route } from '../orchestrator/router.js';

const routeDebugRequestSchema = z.object({
  message: z.string().min(1),
  attachmentMimes: z.array(z.string()).default([]),
});

async function isProjectMember(db: Db, userId: string, projectId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.projectId, projectId)))
    .limit(1);
  return rows.length > 0;
}

/** Exposes router.route() directly, for eval/suites/router.ts's accuracy suite. */
export function createRouterDebugRouter(db: Db, gateway: ModelGateway): Router {
  const router = Router();

  router.post('/projects/:id/route-debug', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const projectId = req.params.id as string;
    const parsed = routeDebugRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    const member = await isProjectMember(db, user.id, projectId);
    const decision = can(user, 'conversation:create', { projectId, isProjectMember: member });
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }

    const hasReadyDocuments = await projectHasReadyDocuments(db, projectId);

    // route()'s llm-small JSON classification call writes a span, which
    // needs a real traces row (same bug as retrieval-debug — see its fix).
    const [trace] = await db.insert(traces).values({ userId: user.id }).returning();
    if (!trace) throw new Error('failed to open trace');

    const routeDecision = await route({
      message: parsed.data.message,
      attachments: parsed.data.attachmentMimes.map((mime, i) => ({ filename: `attachment-${i}`, mime })),
      hasReadyDocuments,
      gateway,
      user,
      traceId: trace.id,
    });
    res.json(routeDecision);
  });

  return router;
}
