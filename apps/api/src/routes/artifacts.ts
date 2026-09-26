import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import type { Db } from '../db/client.js';
import { artifacts, projectMembers } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import { sameWorkspace } from '../policy/scope.js';

export function createArtifactsRouter(db: Db, dataDir: string): Router {
  const router = Router();

  router.get('/artifacts/:id', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const [artifact] = await db.select().from(artifacts).where(eq(artifacts.id, req.params.id as string)).limit(1);
    if (!artifact) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    // Artifacts come out of one person's private conversation (their memories, files, images). Only the creator or
    // an administrator may open them, even when another user shares the project.
    const isAdmin = sameWorkspace(user, artifact.workspaceId) && (user.role === 'super_admin' || user.role === 'workspace_admin');
    if (artifact.createdBy !== user.id && !isAdmin) {
      res.status(403).json({ error: 'this file belongs to another user' });
      return;
    }
    const [membership] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.userId, user.id), eq(projectMembers.projectId, artifact.projectId)))
      .limit(1);
    const decision = can(user, 'document:read', {
      projectId: artifact.projectId,
      isProjectMember: Boolean(membership),
      resourceWorkspaceId: artifact.workspaceId,
      documentClassification: artifact.classification as 0 | 1 | 2 | 3,
    });
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const filePath = path.resolve(dataDir, artifact.storagePath);
    res.setHeader('content-type', artifact.mime);
    res.setHeader('content-disposition', `inline; filename="${encodeURIComponent(artifact.filename)}"`);
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'file not found on disk' });
    });
  });

  return router;
}
