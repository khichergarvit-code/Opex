import { desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { policies } from '../db/schema/index.js';
import { DEFAULT_POLICY_RULES, policyRulesSchema, type PolicyRules } from './rules.js';

/**
 * Reads the active PolicyRules from the `policies` table instead of the
 * static DEFAULT_POLICY_RULES constant — previously nothing ever queried
 * this table back (see policies.ts). Falls back to the default when no
 * row exists yet (a fresh DB before the admin Policies page writes one).
 */
export async function loadActivePolicyRules(db: Db, workspaceId?: string): Promise<PolicyRules> {
  const [row] = await db
    .select()
    .from(policies)
    .where(workspaceId ? eq(policies.workspaceId, workspaceId) : isNull(policies.workspaceId))
    .orderBy(desc(policies.updatedAt))
    .limit(1);

  if (!row) return DEFAULT_POLICY_RULES;
  return policyRulesSchema.parse(row.rules);
}
