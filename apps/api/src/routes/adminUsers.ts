import argon2 from 'argon2';
import { createUserRequestSchema } from '@opex/shared';
import { desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import type { Db } from '../db/client.js';
import { projectMembers, projects, users, workspaces } from '../db/schema/index.js';
import { adminScope, sameWorkspace } from '../policy/scope.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import type { AuditWriter } from '../audit/writeAudit.js';

function inScope(user: import('../policy/types.js').AuthedUser) {
  const scope = adminScope(user);
  if (scope.all) return undefined;
  return scope.workspaceId ? eq(users.workspaceId, scope.workspaceId) : eq(users.id, user.id);
}

/** ui.md's Admin §B1: "B1 adds users, groups, and access requests." */
export function createAdminUsersRouter(db: Db, auditWriter: AuditWriter): Router {
  const router = Router();

  router.get('/admin/users', requireAuth(db), async (req, res) => {
    const decision = can(req.user!, 'user:create');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        clearance: users.clearance,
        status: users.status,
        workspaceId: users.workspaceId,
        workspaceName: workspaces.name,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(workspaces, eq(users.workspaceId, workspaces.id))
      .where(inScope(req.user!))
      .orderBy(desc(users.createdAt));
    res.json(rows);
  });

  router.post('/admin/users', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const decision = can(user, 'user:create');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const parsed = createUserRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    // A workspace admin creates people only inside their own workspace and cannot mint super admins.
    const scope = adminScope(user);
    if (!scope.all && parsed.data.role === 'super_admin') {
      res.status(403).json({ error: 'only a super admin can create a super admin' });
      return;
    }
    const workspaceId = scope.all ? (parsed.data.role === 'super_admin' ? null : (parsed.data.workspaceId ?? null)) : scope.workspaceId;
    if (!scope.all && !workspaceId) {
      res.status(403).json({ error: 'your account is not assigned to a workspace' });
      return;
    }
    // Everyone but a platform-wide super admin needs a project to actually do anything (chat, documents —
    // every project-scoped check in policy/can.ts requires it). Pick or create one now, not later:
    // no production membership is ever created outside this path or the seed script.
    let projectName: string | null = null;
    let chosenProjectId: string | null = null;
    if (workspaceId) {
      const workspaceProjects = await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.workspaceId, workspaceId));
      if (workspaceProjects.length === 0) {
        const [created] = await db.insert(projects).values({ workspaceId, name: 'Default Project', defaultClassification: 1 }).returning();
        chosenProjectId = created!.id;
        projectName = created!.name;
      } else if (workspaceProjects.length === 1) {
        chosenProjectId = workspaceProjects[0]!.id;
        projectName = workspaceProjects[0]!.name;
      } else if (parsed.data.projectId) {
        const match = workspaceProjects.find((p) => p.id === parsed.data.projectId);
        if (!match) {
          res.status(400).json({ error: 'that project is not in the chosen workspace' });
          return;
        }
        chosenProjectId = match.id;
        projectName = match.name;
      } else {
        res.status(400).json({
          error: 'this workspace has more than one project — choose one',
          projects: workspaceProjects,
        });
        return;
      }
    }

    const data = parsed.data;
    const passwordHash = await argon2.hash(data.password);
    async function insertUser() {
      return db
        .insert(users)
        .values({
          email: data.email,
          name: data.name,
          passwordHash,
          role: data.role,
          clearance: data.clearance,
          workspaceId,
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          clearance: users.clearance,
          status: users.status,
          createdAt: users.createdAt,
        });
    }
    let inserted: Awaited<ReturnType<typeof insertUser>>;
    try {
      inserted = await insertUser();
    } catch (err) {
      // Postgres unique-violation on users.email — a plain, expected input error, not a server fault.
      if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
        res.status(409).json({ error: 'an account with this email already exists' });
        return;
      }
      throw err;
    }
    const [row] = inserted;
    if (chosenProjectId) {
      await db.insert(projectMembers).values({ projectId: chosenProjectId, userId: row!.id }).onConflictDoNothing();
    }
    await auditWriter.writeAudit({
      actorId: user.id,
      action: 'user.create',
      resource: row!.id,
      details: { email: parsed.data.email, role: parsed.data.role, clearance: parsed.data.clearance, projectId: chosenProjectId },
    });
    res.status(201).json({ ...row, projectName });
  });

  async function setStatus(req: import('express').Request, res: import('express').Response, status: 'active' | 'disabled') {
    const user = req.user!;
    const targetUserId = req.params.id as string;
    const decision = can(user, 'user:disable', { targetUserId });
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const [target] = await db.select({ workspaceId: users.workspaceId }).from(users).where(eq(users.id, targetUserId)).limit(1);
    if (!target || !sameWorkspace(user, target.workspaceId)) {
      res.status(404).json({ error: 'user not found' });
      return;
    }
    const [row] = await db
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, targetUserId))
      .returning({ id: users.id, status: users.status });
    if (!row) {
      res.status(404).json({ error: 'user not found' });
      return;
    }
    await auditWriter.writeAudit({
      actorId: user.id,
      action: status === 'disabled' ? 'user.disable' : 'user.enable',
      resource: targetUserId,
    });
    res.json(row);
  }

  /** Workspaces are platform-level: only the super admin lists or creates them. */
  router.get('/admin/workspaces', requireAuth(db), async (req, res) => {
    if (req.user!.role !== 'super_admin') {
      res.status(403).json({ error: 'requires super_admin' });
      return;
    }
    res.json(await db.select().from(workspaces).orderBy(workspaces.createdAt));
  });

  router.post('/admin/workspaces', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (user.role !== 'super_admin') {
      res.status(403).json({ error: 'requires super_admin' });
      return;
    }
    if (name.length < 2 || name.length > 80) {
      res.status(400).json({ error: 'name must be 2-80 characters' });
      return;
    }
    const [row] = await db.insert(workspaces).values({ name }).returning();
    await auditWriter.writeAudit({ actorId: user.id, action: 'workspace.create', resource: row!.id, details: { name } });
    res.status(201).json(row);
  });

  /** Move a person to another workspace: platform-level, so super admin only. */
  router.patch('/admin/users/:id/workspace', requireAuth(db), async (req, res) => {
    const user = req.user!;
    if (user.role !== 'super_admin') {
      res.status(403).json({ error: 'requires super_admin' });
      return;
    }
    const workspaceId = typeof req.body?.workspaceId === 'string' ? req.body.workspaceId : null;
    if (workspaceId) {
      const [w] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      if (!w) {
        res.status(404).json({ error: 'workspace not found' });
        return;
      }
    }
    const [row] = await db.update(users).set({ workspaceId, updatedAt: new Date() }).where(eq(users.id, req.params.id as string)).returning({ id: users.id, workspaceId: users.workspaceId });
    if (!row) {
      res.status(404).json({ error: 'user not found' });
      return;
    }
    await auditWriter.writeAudit({ actorId: user.id, action: 'user.workspace_set', resource: row.id, details: { workspaceId } });
    res.json(row);
  });

  router.patch('/admin/users/:id/disable', requireAuth(db), (req, res) => setStatus(req, res, 'disabled'));
  router.patch('/admin/users/:id/enable', requireAuth(db), (req, res) => setStatus(req, res, 'active'));

  return router;
}
