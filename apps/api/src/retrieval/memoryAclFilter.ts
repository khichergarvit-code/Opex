import { sql, type SQL } from 'drizzle-orm';
import type { Classification } from '@opex/shared';

export interface MemoryAclParams {
  userId: string;
  workspaceId: string;
  projectId: string;
  clearance: Classification;
}

/**
 * Mirrors retrieval/aclFilter.ts's aclWhereClause() exactly — SQL-only,
 * never post-filtered (invariant #4/#9). This is the piece that directly
 * implements memory.md's "memory from Restricted sources never reaches
 * an Internal user": a memory's own classification, not the reader's,
 * gates access, same as chunks. Scope decides *which* rows are even
 * candidates (a user's own, their current project's, or their whole
 * workspace's) before classification is checked.
 */
export function memoryAclWhereClause(params: MemoryAclParams): SQL {
  return sql`
    m.deleted_at IS NULL
    AND m.classification <= ${params.clearance}
    AND (
      (m.scope = 'user' AND m.user_id = ${params.userId})
      OR (m.scope = 'project' AND m.project_id = ${params.projectId})
      OR (m.scope = 'workspace' AND m.workspace_id = ${params.workspaceId})
    )
  `;
}
