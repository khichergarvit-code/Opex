import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { loginRequestSchema } from '@opex/shared';
import type { Db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import { issueCsrfToken } from '../middleware/csrf.js';
import { requireAuth } from '../middleware/requireAuth.js';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

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

    // Constant-shape response for unknown user / bad password / locked / disabled,
    // so a client can't distinguish "no such user" from "wrong password".
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

    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
    req.session.userId = row.id;
    const csrfToken = issueCsrfToken(req);

    // Required after regenerate(): a regenerated session isn't tracked by
    // the response-end auto-save hook, so without an explicit save() here
    // no Set-Cookie header is ever sent (the session still persists to the
    // store, but the client never learns its id).
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    res.json({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      clearance: row.clearance,
      csrfToken,
    });
  });

  router.post('/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.status(204).end();
    });
  });

  router.get('/me', requireAuth(db), (req, res) => {
    const user = req.user!;
    // issueCsrfToken is idempotent (reuses the session's existing token if
    // set) — this lets the frontend restore a mutating-request-capable
    // session on page load, not just read-only state.
    const csrfToken = issueCsrfToken(req);
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
