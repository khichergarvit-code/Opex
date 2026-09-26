import { eq } from 'drizzle-orm';
import { inScopeWorkspace } from '../policy/scope.js';
import { Router } from 'express';
import type { Db } from '../db/client.js';
import { projectMembers, projects } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';

export function createProjectsRouter(db: Db): Router {
  const router = Router();

  router.get('/projects', requireAuth(db), async (req, res) => {
    const user = req.user!;
    if (user.role === 'super_admin' || user.role === 'workspace_admin') {
      const rows = await db.select().from(projects).where(inScopeWorkspace(user, projects.workspaceId));
      res.json(rows);
      return;
    }
    const rows = await db
      .select({
        id: projects.id,
        workspaceId: projects.workspaceId,
        name: projects.name,
        defaultClassification: projects.defaultClassification,
      })
      .from(projects)
      .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
      .where(eq(projectMembers.userId, user.id));
    res.json(rows);
  });

  return router;
}
