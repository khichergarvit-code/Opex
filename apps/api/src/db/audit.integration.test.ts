import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectTestDb } from './testDb.js';
import { auditLog } from './schema/index.js';
import type { Db } from './client.js';

let db: Db | null;

beforeAll(async () => {
  db = await connectTestDb();
});

describe('audit_log append-only trigger', () => {
  it('rejects UPDATE and DELETE on audit_log rows (invariant #7)', async () => {
    if (!db) {
      // No reachable Postgres — see testDb.ts. Run `make up` (or a local
      // migrated Postgres) and re-run tests to exercise this for real.
      return;
    }
    const [row] = await db
      .insert(auditLog)
      .values({ action: 'test.audit_trigger', resource: 'audit.integration.test' })
      .returning();
    expect(row).toBeDefined();

    await expect(
      db.update(auditLog).set({ action: 'tampered' }).where(eq(auditLog.id, row!.id)),
    ).rejects.toThrow(/append-only/i);

    await expect(db.delete(auditLog).where(eq(auditLog.id, row!.id))).rejects.toThrow(
      /append-only/i,
    );
  });
});
