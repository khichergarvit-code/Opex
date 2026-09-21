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
});
export type PolicyRules = z.infer<typeof policyRulesSchema>;

export const DEFAULT_POLICY_RULES: PolicyRules = {
  allowedModelsByRole: {
    super_admin: ['router', 'general', 'coder', 'vision', 'embed', 'rerank'],
    workspace_admin: ['router', 'general', 'coder', 'vision', 'embed', 'rerank'],
    employee: ['router', 'general', 'embed', 'rerank'],
  },
  dailyTokenQuota: {},
  allowedTools: {},
  uploadLimitMb: 50,
  webAccess: false,
};
