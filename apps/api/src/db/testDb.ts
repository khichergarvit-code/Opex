import { createDb, type Db } from './client.js';

/**
 * DB-backed tests (auth flow, audit trigger) need a real, migrated Postgres.
 * Rather than mocking Postgres, they connect to DATABASE_URL and skip
 * themselves when it isn't reachable, so `pnpm test` stays green before
 * `make up` / a local Postgres exists, and exercises the real thing once one
 * does (see docs/PROGRESS.md and the AC verification steps for how to run
 * them for real).
 */
export async function connectTestDb(): Promise<Db | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    const db = createDb({ DATABASE_URL: url });
    await db.execute('select 1');
    return db;
  } catch {
    return null;
  }
}
