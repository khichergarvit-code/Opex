import { desc, eq, isNull } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { policies, users } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import { policyRulesSchema } from '../policy/rules.js';
import type { Action, PolicyContext } from '../policy/types.js';
import type { AuditWriter } from '../audit/writeAudit.js';

const putPolicySchema = z.object({ rules: policyRulesSchema });
const previewSchema = z.object({
  userId: z.string().uuid(),
  action: z.string(),
  ctx: z.record(z.string(), z.unknown()).default({}),
});

/** ui.md's Admin §B5: "Policies: an editor with a 'what can this user do' preview." */
export function createAdminPoliciesRouter(db: Db, auditWriter: AuditWriter): Router {
  const router = Router();

  router.get('/admin/policies', requireAuth(db), async (req, res) => {
    const decision = can(req.user!, 'admin:policies:read');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const rows = await db.select().from(policies).where(isNull(policies.workspaceId)).orderBy(desc(policies.updatedAt));
    res.json(rows);
  });

  router.put('/admin/policies/:id', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const decision = can(user, 'admin:policies:write');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const parsed = putPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body', details: parsed.error.flatten() });
      return;
    }
    const [row] = await db
      .update(policies)
      .set({ rules: parsed.data.rules, updatedAt: new Date() })
      .where(eq(policies.id, req.params.id as string))
      .returning();
    if (!row) {
      res.status(404).json({ error: 'policy not found' });
      return;
    }
    await auditWriter.writeAudit({ actorId: user.id, action: 'policy.update', resource: row.id, details: parsed.data.rules });
    res.json(row);
  });

  // Runs can() against a DRAFT set of rules (not yet saved) for a real
  // user, so an admin can see "what can this user do" before committing
  // a policy change — no new authorization logic, just can() over HTTP.
  router.post('/admin/policies/preview', requireAuth(db), async (req, res) => {
    const decision = can(req.user!, 'admin:policies:read');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const parsed = previewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    const [target] = await db.select().from(users).where(eq(users.id, parsed.data.userId)).limit(1);
    if (!target) {
      res.status(404).json({ error: 'user not found' });
      return;
    }
    const rulesParsed = policyRulesSchema.safeParse(req.body.rules);
    const draftRules = rulesParsed.success ? rulesParsed.data : undefined;
    const decisionResult = can(
      { id: target.id, email: target.email, role: target.role, clearance: target.clearance as 0 | 1 | 2 | 3, status: target.status },
      parsed.data.action as Action,
      parsed.data.ctx as PolicyContext,
      draftRules,
    );
    res.json(decisionResult);
  });

  return router;
}
