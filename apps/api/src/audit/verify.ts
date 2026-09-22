import { createHash } from 'node:crypto';
import { canonicalizeAuditRow } from './canonical.js';

export interface AuditLogRow {
  id: string;
  ts: Date | string;
  actorId: string | null;
  action: string;
  resource: string;
  details: unknown;
  prevHash: string | null;
  hash: string | null;
}

export interface VerifyResult {
  ok: boolean;
  rowsChecked: number;
  brokenAt?: { id: string; ts: Date | string };
}

/**
 * Pure chain-verification logic — recomputes each row's hash from its
 * neighbor's and compares to the stored value. Exported separately from
 * scripts/audit-verify.ts's CLI wrapper so it can be unit-tested against
 * an in-memory fixture with zero DB/trigger involvement.
 */
export function verifyAuditChain(rows: AuditLogRow[]): VerifyResult {
  let expectedPrevHash = '';
  for (const row of rows) {
    const canonicalRow = canonicalizeAuditRow({
      actorId: row.actorId,
      action: row.action,
      resource: row.resource,
      details: row.details,
    });
    const expectedHash = createHash('sha256').update(expectedPrevHash + canonicalRow).digest('hex');
    if (row.hash !== expectedHash || (row.prevHash ?? '') !== expectedPrevHash) {
      return { ok: false, rowsChecked: rows.length, brokenAt: { id: row.id, ts: row.ts } };
    }
    expectedPrevHash = expectedHash;
  }
  return { ok: true, rowsChecked: rows.length };
}
