import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import type { RequestHandler } from 'express';
import type { Env } from '../env.js';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    csrfToken?: string;
  }
}

const PgSession = connectPgSimple(session);

export function createSessionMiddleware(
  env: Pick<Env, 'DATABASE_URL' | 'SESSION_SECRET' | 'NODE_ENV'>,
): RequestHandler {
  return session({
    store: new PgSession({
      conString: env.DATABASE_URL,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    name: 'opex.sid',
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      // TLS is not yet in front of the API in A1 (B6 hardening adds it) — Debt.
      secure: env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8,
    },
  });
}
