export interface AuditRowInput {
  actorId: string | null;
  action: string;
  resource: string;
  details?: unknown;
}

/**
 * Single source of truth for what goes into the hash — imported by both
 * writeAudit.ts (computing hashes on insert) and scripts/audit-verify.ts
 * (recomputing them to check the chain). Must never drift between the two.
 */
export function canonicalizeAuditRow(entry: AuditRowInput): string {
  return JSON.stringify({
    actorId: entry.actorId,
    action: entry.action,
    resource: entry.resource,
    details: entry.details ?? {},
  });
}
