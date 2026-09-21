import { eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import type { Db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import type { AuthedUser } from '../policy/types.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export function requireAuth(db: Db) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.session.userId;
    if (!userId) {
      res.status(401).json({ error: 'not authenticated' });
      return;
    }
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const row = rows[0];
    if (!row || row.status !== 'active') {
      res.status(401).json({ error: 'not authenticated' });
      return;
    }
    req.user = {
      id: row.id,
      email: row.email,
      role: row.role,
      clearance: row.clearance as AuthedUser['clearance'],
      status: row.status,
    };
    next();
  };
}
