import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Login has no prior session to carry a CSRF token, so it can't be
// double-submit protected — it's guarded instead by argon2 + lockout.
const CSRF_EXEMPT_PATHS = new Set(['/auth/login']);

export function issueCsrfToken(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

/** Hand-rolled double-submit token check: header value must match the session's token. */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method) || CSRF_EXEMPT_PATHS.has(req.path)) {
    next();
    return;
  }
  const sessionToken = req.session.csrfToken;
  const headerToken = req.header('x-csrf-token');
  if (
    !sessionToken ||
    !headerToken ||
    sessionToken.length !== headerToken.length ||
    !timingSafeEqual(Buffer.from(sessionToken), Buffer.from(headerToken))
  ) {
    res.status(403).json({ error: 'invalid csrf token' });
    return;
  }
  next();
}
