import { createHash } from 'node:crypto';
import { desc, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { auditLog } from '../db/schema/index.js';
import { canonicalizeAuditRow, type AuditRowInput } from './canonical.js';

export interface AuditWriter {
  writeAudit(entry: AuditRowInput): Promise<void>;
}

/**
 * Concrete DB-backed AuditWriter, mirroring spans/writeSpan.ts's pattern.
 * hash = sha256(prevHash || canonicalRow) per docs/spec/security.md. The
 * read-then-write (fetch last hash, then insert) runs inside a transaction
 * guarded by a Postgres advisory lock, so two concurrent audit writes can
 * never compute the same prevHash — the lock is released automatically at
 * transaction end, and holds only for the duration of one insert.
 */
export function createDbAuditWriter(db: Db): AuditWriter {
  return {
    async writeAudit(entry) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('audit_log'))`);
        const [prev] = await tx.select({ hash: auditLog.hash }).from(auditLog).orderBy(desc(auditLog.ts)).limit(1);
        const prevHash = prev?.hash ?? '';
        const canonicalRow = canonicalizeAuditRow(entry);
        const hash = createHash('sha256').update(prevHash + canonicalRow).digest('hex');
        await tx.insert(auditLog).values({
          actorId: entry.actorId,
          action: entry.action,
          resource: entry.resource,
          details: (entry.details ?? {}) as object,
          prevHash: prevHash || null,
          hash,
        });
      });
    },
  };
}
