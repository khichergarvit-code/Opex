import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { Router, type Request } from 'express';
import { loginRequestSchema, registerRequestSchema } from '@opex/shared';
import type { Db } from '../db/client.js';
import { projectMembers, projects, users } from '../db/schema/index.js';
import { issueCsrfToken } from '../middleware/csrf.js';
import { requireAuth } from '../middleware/requireAuth.js';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

async function establishSession(req: Request, userId: string): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.userId = userId;
  const csrfToken = issueCsrfToken(req);
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
  return csrfToken;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505';
}

export function createAuthRouter(db: Db): Router {
  const router = Router();

  router.post('/auth/login', async (req, res) => {
    const parsed = loginRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    const { email, password } = parsed.data;

    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const row = rows[0];

    const genericFailure = () => res.status(401).json({ error: 'invalid credentials' });

    if (!row || row.status !== 'active') {
      genericFailure();
      return;
    }
    if (row.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
      genericFailure();
      return;
    }

    const valid = await argon2.verify(row.passwordHash, password).catch(() => false);
    if (!valid) {
      const failedCount = row.failedLoginCount + 1;
      await db
        .update(users)
        .set({
          failedLoginCount: failedCount,
          lockedUntil: failedCount >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_MS) : null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, row.id));
      genericFailure();
      return;
    }

    await db
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(users.id, row.id));

    const csrfToken = await establishSession(req, row.id);

    res.json({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      clearance: row.clearance,
      csrfToken,
    });
  });

  router.post('/auth/register', async (req, res) => {
    const parsed = registerRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }

    const passwordHash = await argon2.hash(parsed.data.password);
    try {
      const [row] = await db
        .insert(users)
        .values({
          email: parsed.data.email,
          name: parsed.data.name,
          passwordHash,
          role: 'employee',
          clearance: 1,
        })
        .returning();
      if (!row) {
        res.status(500).json({ error: 'failed to create account' });
        return;
      }

      const [project] = await db.select({ id: projects.id }).from(projects).limit(1);
      if (project) {
        await db.insert(projectMembers).values({ projectId: project.id, userId: row.id });
      }

      const csrfToken = await establishSession(req, row.id);
      res.status(201).json({
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        clearance: row.clearance,
        csrfToken,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: 'email already registered' });
        return;
      }
      throw err;
    }
  });

  router.post('/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.status(204).end();
    });
  });

  router.get('/me', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const csrfToken = issueCsrfToken(req);
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      clearance: user.clearance,
      csrfToken,
    });
  });

  return router;
}
