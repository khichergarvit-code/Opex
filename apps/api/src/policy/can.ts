import { DEFAULT_POLICY_RULES, type PolicyRules } from './rules.js';
import type { Action, AuthedUser, PolicyContext, PolicyDecision } from './types.js';

/**
 * The only authorization decision point (per CLAUDE.md's rule). Every route and
 * the model gateway call this instead of checking roles/clearance inline.
 */
export function can(
  user: AuthedUser,
  action: Action,
  ctx: PolicyContext = {},
  rules: PolicyRules = DEFAULT_POLICY_RULES,
): PolicyDecision {
  if (user.status !== 'active') {
    return { allowed: false, reason: 'user is not active' };
  }

  switch (action) {
    case 'login':
      return { allowed: true };

    case 'model:invoke': {
      if (!ctx.modelRole) {
        return { allowed: false, reason: 'modelRole is required for model:invoke' };
      }
      const allowedRoles = rules.allowedModelsByRole[user.role] ?? [];
      if (!allowedRoles.includes(ctx.modelRole)) {
        return {
          allowed: false,
          reason: `role ${user.role} is not allowed to invoke model role ${ctx.modelRole}`,
        };
      }
      return { allowed: true };
    }

    case 'conversation:create':
    case 'conversation:read':
    case 'conversation:message':
    case 'document:upload': {
      if (user.role === 'super_admin' || user.role === 'workspace_admin') {
        return { allowed: true };
      }
      if (!ctx.isProjectMember) {
        return { allowed: false, reason: 'user is not a member of this project' };
      }
      return { allowed: true };
    }

    case 'document:read': {
      if (user.role === 'super_admin' || user.role === 'workspace_admin') {
        return { allowed: true };
      }
      if (!ctx.isProjectMember) {
        return { allowed: false, reason: 'user is not a member of this project' };
      }
      if (
        ctx.documentClassification !== undefined &&
        user.clearance < ctx.documentClassification
      ) {
        return { allowed: false, reason: 'clearance below document classification' };
      }
      const docGroups = ctx.documentAclGroupIds ?? [];
      if (docGroups.length > 0) {
        const userGroups = new Set(ctx.userGroupIds ?? []);
        const hasGroup = docGroups.some((g) => userGroups.has(g));
        if (!hasGroup) {
          return { allowed: false, reason: 'user is not in a group with access to this document' };
        }
      }
      return { allowed: true };
    }

    case 'tool:invoke': {
      if (!ctx.toolName) {
        return { allowed: false, reason: 'toolName is required for tool:invoke' };
      }
      if (!(ctx.agentToolAllowlist ?? []).includes(ctx.toolName)) {
        return { allowed: false, reason: `tool "${ctx.toolName}" is not in the agent's allowlist` };
      }
      // Invariant #10: once a task touches Confidential+ data, outbound
      // tools are disabled for that task. A3 has no egress-capable tools
      // (code_exec/make_chart/describe_image all run locally), so this is
      // a no-op today — the code path exists so B6's web_search only has
      // to flag itself, not build this gate from scratch.
      if (
        ctx.taskClassification !== undefined &&
        ctx.taskClassification >= 2 &&
        rules.egressCapableTools?.includes(ctx.toolName)
      ) {
        return { allowed: false, reason: 'outbound tools are disabled once a task touches Confidential+ data' };
      }
      return { allowed: true };
    }

    case 'admin:traces:read':
    case 'admin:usage:read': {
      if (user.role === 'super_admin' || user.role === 'workspace_admin') {
        return { allowed: true };
      }
      return { allowed: false, reason: 'admin views require super_admin or workspace_admin' };
    }

    default: {
      const _exhaustive: never = action;
      return { allowed: false, reason: `unknown action ${_exhaustive as string}` };
    }
  }
}
