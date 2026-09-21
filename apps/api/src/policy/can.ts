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
    case 'conversation:message': {
      if (user.role === 'super_admin' || user.role === 'workspace_admin') {
        return { allowed: true };
      }
      if (!ctx.isProjectMember) {
        return { allowed: false, reason: 'user is not a member of this project' };
      }
      return { allowed: true };
    }

    default: {
      const _exhaustive: never = action;
      return { allowed: false, reason: `unknown action ${_exhaustive as string}` };
    }
  }
}
