import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalizeAuditRow } from './canonical.js';
import { verifyAuditChain, type AuditLogRow } from './verify.js';

function buildValidChain(n: number): AuditLogRow[] {
  const rows: AuditLogRow[] = [];
  let prevHash = '';
  for (let i = 0; i < n; i++) {
    const row = { actorId: `u${i}`, action: `action.${i}`, resource: `res${i}`, details: { i } };
    const canonicalRow = canonicalizeAuditRow(row);
    const hash = createHash('sha256').update(prevHash + canonicalRow).digest('hex');
    rows.push({ id: `row${i}`, ts: new Date(2026, 0, i + 1), ...row, prevHash: prevHash || null, hash });
    prevHash = hash;
  }
  return rows;
}

describe('verifyAuditChain', () => {
  it('reports ok for a valid 5-row chain', () => {
    const rows = buildValidChain(5);
    expect(verifyAuditChain(rows)).toEqual({ ok: true, rowsChecked: 5 });
  });

  it('reports ok for an empty chain', () => {
    expect(verifyAuditChain([])).toEqual({ ok: true, rowsChecked: 0 });
  });

  it('detects tampering at the exact row whose details were mutated', () => {
    const rows = buildValidChain(5);
    rows[2]!.details = { tampered: true };
    const result = verifyAuditChain(rows);
    expect(result.ok).toBe(false);
    expect(result.brokenAt?.id).toBe('row2');
  });

  it('detects a corrupted stored hash even when details are untouched', () => {
    const rows = buildValidChain(5);
    rows[3]!.hash = 'not-a-real-hash';
    const result = verifyAuditChain(rows);
    expect(result.ok).toBe(false);
    expect(result.brokenAt?.id).toBe('row3');
  });
});
