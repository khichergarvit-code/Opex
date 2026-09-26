import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { projectMembers, projects, traces, userGroups } from '../db/schema/index.js';
import type { ModelGateway, SpanWriter } from '../models/gateway.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import { projectWorkspaceId } from '../policy/scope.js';
import { search } from '../retrieval/index.js';

const searchRequestSchema = z.object({
  query: z.string().min(1),
});

async function isProjectMember(db: Db, userId: string, projectId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.projectId, projectId)))
    .limit(1);
  return rows.length > 0;
}

/**
 * Raw retrieval results (no doc_qa/LLM answer synthesis), used by
 * eval/suites/retrieval.ts to measure recall@5/MRR independent of answer
 * quality — see eval.md's "retrieval" suite and the A2 AC's baseline.
 */
export function createRetrievalRouter(db: Db, gateway: ModelGateway, spanWriter: SpanWriter): Router {
  const router = Router();

  router.post('/projects/:id/retrieval-debug', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const projectId = req.params.id as string;
    const parsed = searchRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }

    const member = await isProjectMember(db, user.id, projectId);
    const decision = can(user, 'document:read', { projectId, isProjectMember: member, resourceWorkspaceId: await projectWorkspaceId(db, projectId) });
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }

    const groupRows = await db
      .select({ groupId: userGroups.groupId })
      .from(userGroups)
      .where(eq(userGroups.userId, user.id));

    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!proj) {
      res.status(404).json({ error: 'project not found' });
      return;
    }

    // search() writes a kind:'retrieval' span (invariant #6), which needs a
    // real traces row to satisfy the FK — a bare crypto.randomUUID() here
    // would 500 on the first span write (found via a real eval run).
    const [trace] = await db.insert(traces).values({ userId: user.id }).returning();
    if (!trace) throw new Error('failed to open trace');

    const outcome = await search(
      { db, gateway, spanWriter, user, traceId: trace.id },
      {
        workspaceId: proj.workspaceId,
        projectIds: [projectId],
        userId: user.id,
        clearance: user.clearance,
        groupIds: groupRows.map((g) => g.groupId),
        query: parsed.data.query,
      },
    );

    res.json({
      noSupport: outcome.noSupport,
      latencyMs: outcome.latencyMs,
      chunks: outcome.chunks.map((c) => ({
        documentId: c.documentId,
        page: c.page,
        kind: c.kind,
        score: c.score,
        textPreview: c.text.slice(0, 200),
      })),
    });
  });

  return router;
}
