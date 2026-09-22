import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectTestDb } from './testDb.js';
import { auditLog } from './schema/index.js';
import type { Db } from './client.js';
import { createDbAuditWriter } from '../audit/writeAudit.js';

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

    // Cleanup: the trigger blocks DELETE too, so the row this test inserted
    // stays forever otherwise — briefly disable/re-enable, same mechanism
    // the tamper test below uses deliberately, to keep the table tidy.
    await db.execute(sql`ALTER TABLE audit_log DISABLE TRIGGER audit_log_append_only`);
    await db.delete(auditLog).where(eq(auditLog.id, row!.id));
    await db.execute(sql`ALTER TABLE audit_log ENABLE TRIGGER audit_log_append_only`);
  });
});

describe('audit hash chain (B1)', () => {
  it('pnpm audit:verify detects a row tampered with outside the app layer', async () => {
    if (!db) return; // see testDb.ts

    const writer = createDbAuditWriter(db);
    const marker = `test.tamper.${Date.now()}`;
    await writer.writeAudit({ actorId: null, action: marker, resource: 'r1' });
    await writer.writeAudit({ actorId: null, action: `${marker}.2`, resource: 'r2' });

    // A real tamper requires bypassing the trigger — exactly like an
    // attacker with raw DB access would need to. This is not a lasting
    // weakening of invariant #7: the trigger is re-enabled immediately
    // after, in the same test, against a disposable test database.
    await db.execute(sql`ALTER TABLE audit_log DISABLE TRIGGER audit_log_append_only`);
    await db.execute(sql`UPDATE audit_log SET action = 'tampered' WHERE action = ${marker}`);
    await db.execute(sql`ALTER TABLE audit_log ENABLE TRIGGER audit_log_append_only`);

    const scriptPath = fileURLToPath(new URL('../../../../scripts/audit-verify.ts', import.meta.url));
    let exitCode = 0;
    let output = '';
    try {
      output = execFileSync('npx', ['tsx', scriptPath], {
        env: { ...process.env },
        encoding: 'utf8',
      });
    } catch (err) {
      exitCode = (err as { status?: number }).status ?? 1;
      output = String((err as { stdout?: string }).stdout ?? '') + String((err as { stderr?: string }).stderr ?? '');
    }
    expect(exitCode).toBe(1);
    expect(output).toMatch(/BROKEN CHAIN/);

    // Cleanup, same mechanism as above.
    await db.execute(sql`ALTER TABLE audit_log DISABLE TRIGGER audit_log_append_only`);
    await db.execute(sql`DELETE FROM audit_log WHERE action LIKE ${marker + '%'} OR action = 'tampered'`);
    await db.execute(sql`ALTER TABLE audit_log ENABLE TRIGGER audit_log_append_only`);
  });
});
