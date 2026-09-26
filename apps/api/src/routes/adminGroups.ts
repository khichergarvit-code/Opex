import { createGroupRequestSchema, groupMembershipRequestSchema } from '@opex/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import type { Db } from '../db/client.js';
import { groups, userGroups, users } from '../db/schema/index.js';
import { adminScope, inScopeWorkspace, sameWorkspace } from '../policy/scope.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import type { AuditWriter } from '../audit/writeAudit.js';

export function createAdminGroupsRouter(db: Db, auditWriter: AuditWriter): Router {
  const router = Router();

  router.get('/admin/groups', requireAuth(db), async (req, res) => {
    const decision = can(req.user!, 'group:manage');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const groupRows = await db.select().from(groups).where(inScopeWorkspace(req.user!, groups.workspaceId));
    const memberRows = groupRows.length ? await db.select().from(userGroups).where(inArray(userGroups.groupId, groupRows.map((g) => g.id))) : [];
    const result = groupRows.map((g) => ({
      ...g,
      createdAt: g.createdAt.toISOString(),
      memberIds: memberRows.filter((m) => m.groupId === g.id).map((m) => m.userId),
    }));
    res.json(result);
  });

  router.post('/admin/groups', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const decision = can(user, 'group:manage');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const parsed = createGroupRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    const scope = adminScope(user);
    // A workspace admin's groups belong to their workspace; a super admin's default to the first workspace's people via the creator.
    const [creator] = await db.select({ workspaceId: users.workspaceId }).from(users).where(eq(users.id, user.id)).limit(1);
    const workspaceId = scope.all ? (creator?.workspaceId ?? null) : scope.workspaceId;
    const [row] = await db.insert(groups).values({ name: parsed.data.name, workspaceId }).returning();
    await auditWriter.writeAudit({ actorId: user.id, action: 'group.create', resource: row!.id, details: { name: parsed.data.name } });
    res.status(201).json({ ...row, memberIds: [] });
  });

  router.post('/admin/groups/:id/members', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const groupId = req.params.id as string;
    const decision = can(user, 'group:manage');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const parsed = groupMembershipRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    const [group] = await db.select({ workspaceId: groups.workspaceId }).from(groups).where(eq(groups.id, groupId)).limit(1);
    const [member] = await db.select({ workspaceId: users.workspaceId }).from(users).where(eq(users.id, parsed.data.userId)).limit(1);
    // The group and the person must both be inside the admin's workspace, and in the same one as each other.
    if (!group || !member || !sameWorkspace(user, group.workspaceId) || (member.workspaceId ?? null) !== (group.workspaceId ?? null) && user.role !== 'super_admin') {
      res.status(404).json({ error: 'group or user not found' });
      return;
    }
    await db.insert(userGroups).values({ groupId, userId: parsed.data.userId }).onConflictDoNothing();
    await auditWriter.writeAudit({
      actorId: user.id,
      action: 'group.member.add',
      resource: groupId,
      details: { userId: parsed.data.userId },
    });
    res.status(201).json({ groupId, userId: parsed.data.userId });
  });

  router.delete('/admin/groups/:id/members/:userId', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const groupId = req.params.id as string;
    const targetUserId = req.params.userId as string;
    const decision = can(user, 'group:manage');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const [grp] = await db.select({ workspaceId: groups.workspaceId }).from(groups).where(eq(groups.id, groupId)).limit(1);
    if (!grp || !sameWorkspace(user, grp.workspaceId)) {
      res.status(404).json({ error: 'group not found' });
      return;
    }
    await db
      .delete(userGroups)
      .where(and(eq(userGroups.groupId, groupId), eq(userGroups.userId, targetUserId)));
    await auditWriter.writeAudit({
      actorId: user.id,
      action: 'group.member.remove',
      resource: groupId,
      details: { userId: targetUserId },
    });
    res.status(204).end();
  });

  return router;
}
