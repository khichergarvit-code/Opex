import argon2 from 'argon2';
import { createUserRequestSchema } from '@opex/shared';
import { desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import type { Db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import type { AuditWriter } from '../audit/writeAudit.js';

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
        createdAt: users.createdAt,
      })
      .from(users)
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
    const passwordHash = await argon2.hash(parsed.data.password);
    const [row] = await db
      .insert(users)
      .values({
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        role: parsed.data.role,
        clearance: parsed.data.clearance,
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
    await auditWriter.writeAudit({
      actorId: user.id,
      action: 'user.create',
      resource: row!.id,
      details: { email: parsed.data.email, role: parsed.data.role, clearance: parsed.data.clearance },
    });
    res.status(201).json(row);
  });

  async function setStatus(req: import('express').Request, res: import('express').Response, status: 'active' | 'disabled') {
    const user = req.user!;
    const targetUserId = req.params.id as string;
    const decision = can(user, 'user:disable', { targetUserId });
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
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

  router.patch('/admin/users/:id/disable', requireAuth(db), (req, res) => setStatus(req, res, 'disabled'));
  router.patch('/admin/users/:id/enable', requireAuth(db), (req, res) => setStatus(req, res, 'active'));

  return router;
}
