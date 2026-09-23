import { sql, type SQL } from 'drizzle-orm';
import type { SearchParams } from './types.js';

/**
 * Drizzle's `sql` template spreads a plain JS array interpolated with
 * `${arr}` into a comma-separated list (`(a, b, c)`), not a single bound
 * array parameter — which breaks `= ANY($1)` and `&& $1` (they need one
 * array value, not N values). Build the Postgres array literal ourselves
 * and pass it as a single string parameter, cast on the Postgres side.
 */
export function uuidArrayLiteral(ids: string[]): string {
  return `{${ids.join(',')}}`;
}

/**
 * The one WHERE fragment every retrieval query must use — invariant #4.
 * Never filter chunks after they've left Postgres; this is the boundary.
 */
export function aclWhereClause(params: SearchParams): SQL {
  const projectIdsLiteral = uuidArrayLiteral(params.projectIds);
  const groupIdsLiteral = uuidArrayLiteral(params.groupIds);

  return sql`
    c.workspace_id = ${params.workspaceId}
    AND c.project_id = ANY(${projectIdsLiteral}::uuid[])
    AND (
      c.classification <= ${params.clearance}
      OR EXISTS (
        SELECT 1 FROM access_grants g
        WHERE g.document_id = c.document_id
          AND g.user_id = ${params.userId}
          AND (g.expires_at IS NULL OR g.expires_at > now())
      )
    )
    AND (c.acl_group_ids && ${groupIdsLiteral}::uuid[] OR c.acl_group_ids = '{}')
  `;
}
