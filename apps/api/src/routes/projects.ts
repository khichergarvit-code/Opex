import { eq } from 'drizzle-orm';
import { inScopeWorkspace } from '../policy/scope.js';
import { Router } from 'express';
import type { Db } from '../db/client.js';
import { projectMembers, projects, workspaces } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';

export function createProjectsRouter(db: Db): Router {
  const router = Router();

  router.get('/projects', requireAuth(db), async (req, res) => {
    const user = req.user!;
    if (user.role === 'super_admin' || user.role === 'workspace_admin') {
      // An admin who can see more than one workspace's projects needs the workspace name too —
      // otherwise two workspaces' same-named "Default Project" rows are indistinguishable in the UI.
      const rows = await db
        .select({
          id: projects.id,
          workspaceId: projects.workspaceId,
          name: projects.name,
          defaultClassification: projects.defaultClassification,
          workspaceName: workspaces.name,
        })
        .from(projects)
        .leftJoin(workspaces, eq(workspaces.id, projects.workspaceId))
        .where(inScopeWorkspace(user, projects.workspaceId));
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
