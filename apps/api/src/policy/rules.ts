import { z } from 'zod';

/**
 * Shape of the `policies.rules` jsonb column. A1 only reads allowedModelsByRole
 * (checked by can()'s model:invoke case). The rest of security.md's Policy
 * section (quota, tools, upload limits, web access, approval rules) is
 * represented here for forward compatibility but is not enforced until the
 * milestone that builds the corresponding system.
 */
export const policyRulesSchema = z.object({
  allowedModelsByRole: z.record(z.string(), z.array(z.string())).default({}),
  dailyTokenQuota: z.record(z.string(), z.number()).default({}),
  allowedTools: z.record(z.string(), z.array(z.string())).default({}),
  uploadLimitMb: z.number().default(50),
  webAccess: z.boolean().default(false),
  // Tools that can reach outside the sandbox/host once one exists (B6's
  // web_search). A3's 3 tools (code_exec, make_chart, describe_image) are
  // all local — this list is empty until B6, but can()'s tool:invoke case
  // already reads it (invariant #10's code path, built now, used later).
  egressCapableTools: z.array(z.string()).default([]),
  // B2: per-workspace TTL for long-term memory, enforced by a nightly
  // purge (memory/scheduler.ts). null = never expires for that type.
  memoryTtlDays: z
    .object({ episodic: z.number().nullable(), semantic: z.number().nullable() })
    .default({ episodic: 90, semantic: 180 }),
});
export type PolicyRules = z.infer<typeof policyRulesSchema>;

export const DEFAULT_POLICY_RULES: PolicyRules = {
  allowedModelsByRole: {
    super_admin: ['router', 'general', 'coder', 'vision', 'embed', 'rerank'],
    workspace_admin: ['router', 'general', 'coder', 'vision', 'embed', 'rerank'],
    employee: ['router', 'general', 'vision', 'embed', 'rerank'],
  },
  dailyTokenQuota: {},
  allowedTools: {},
  uploadLimitMb: 50,
  webAccess: false,
  egressCapableTools: [],
  memoryTtlDays: { episodic: 90, semantic: 180 },
};
