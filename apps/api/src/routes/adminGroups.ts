import { createGroupRequestSchema, groupMembershipRequestSchema } from '@opex/shared';
import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import type { Db } from '../db/client.js';
import { groups, userGroups } from '../db/schema/index.js';
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
    const groupRows = await db.select().from(groups);
    const memberRows = await db.select().from(userGroups);
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
    const [row] = await db.insert(groups).values({ name: parsed.data.name }).returning();
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
