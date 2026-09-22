// Run via `pnpm audit:verify` (tsx), matching eval/runner.ts's pattern.
// Walks audit_log in ts order, recomputes each row's hash via the same
// logic apps/api/src/audit/writeAudit.ts uses to write them, and reports
// the first broken link — docs/spec/security.md: "pnpm audit:verify
// reports the first broken link." A standalone script (not through the
// api container) so it works even if the api is down; connects directly
// to Postgres like fetch-models.sh connects directly to the internet —
// both are host-side operational tools, not runtime app code.
import postgres from 'postgres';
import { verifyAuditChain, type AuditLogRow } from '../apps/api/src/audit/verify.js';

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://opex:opex_dev_only_change_me@localhost:5432/opex';

async function main(): Promise<void> {
  const sql = postgres(databaseUrl);
  try {
    const rows = await sql<AuditLogRow[]>`
      SELECT id, ts, actor_id AS "actorId", action, resource, details,
             prev_hash AS "prevHash", hash
      FROM audit_log
      ORDER BY ts ASC
    `;
    const result = verifyAuditChain(rows);
    if (result.ok) {
      console.log(`OK — ${result.rowsChecked} rows verified`);
      process.exit(0);
    } else {
      console.error(
        `BROKEN CHAIN — first mismatch at row ${result.brokenAt!.id} (ts=${result.brokenAt!.ts})`,
      );
      process.exit(1);
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('audit:verify failed:', err);
  process.exit(1);
});
