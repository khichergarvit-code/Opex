export interface AuditRowInput {
  actorId: string | null;
  action: string;
  resource: string;
  details?: unknown;
}

/**
 * Deterministic JSON.stringify: sorts object keys recursively. Required
 * because Postgres's jsonb column does NOT preserve key insertion order —
 * a `details` object written as {requestId, reason} can come back from
 * `SELECT` as {reason, requestId}. Plain JSON.stringify is key-order
 * sensitive, so without this, verifying a freshly-read row against its
 * write-time hash produces a false "broken chain" on completely
 * untampered data (found via a live end-to-end run).
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Single source of truth for what goes into the hash — imported by both
 * writeAudit.ts (computing hashes on insert) and scripts/audit-verify.ts
 * (recomputing them to check the chain). Must never drift between the two.
 */
export function canonicalizeAuditRow(entry: AuditRowInput): string {
  return stableStringify({
    actorId: entry.actorId,
    action: entry.action,
    resource: entry.resource,
    details: entry.details ?? {},
  });
}
