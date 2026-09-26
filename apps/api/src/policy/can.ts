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

  // Workspace isolation: a workspace admin has admin powers only inside their own workspace.
  if (
    user.role === 'workspace_admin' &&
    ctx.resourceWorkspaceId !== undefined &&
    ctx.resourceWorkspaceId !== (user.workspaceId ?? null)
  ) {
    return { allowed: false, reason: 'resource belongs to another workspace' };
  }
  // Platform-wide settings are for the super admin only.
  if (
    (action === 'admin:models:manage' || action === 'admin:agents:manage' || action === 'admin:system:read') &&
    user.role !== 'super_admin'
  ) {
    return { allowed: false, reason: 'this setting is platform-wide and requires super_admin' };
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
      const quota = rules.dailyTokenQuota[user.role];
      if (quota !== undefined && (ctx.dailyTokensUsedToday ?? 0) >= quota) {
        return { allowed: false, reason: `daily token quota (${quota}) reached for role ${user.role}` };
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

    case 'document:upload': {
      if (
        ctx.uploadSizeBytes !== undefined &&
        ctx.uploadSizeBytes > rules.uploadLimitMb * 1024 * 1024
      ) {
        return { allowed: false, reason: `file exceeds the ${rules.uploadLimitMb}MB upload limit` };
      }
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
      if (ctx.hasActiveAccessGrant) {
        return { allowed: true };
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
      const roleTools = rules.allowedTools[user.role];
      if (roleTools !== undefined && !roleTools.includes(ctx.toolName)) {
        return { allowed: false, reason: `tool "${ctx.toolName}" is not allowed for role ${user.role}` };
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

    case 'access_request:create': {
      if (!ctx.documentId) {
        return { allowed: false, reason: 'documentId is required for access_request:create' };
      }
      return { allowed: true };
    }

    case 'user:disable': {
      if (ctx.targetUserId !== undefined && ctx.targetUserId === user.id) {
        return { allowed: false, reason: 'a user cannot disable their own account' };
      }
      if (user.role === 'super_admin' || user.role === 'workspace_admin') {
        return { allowed: true };
      }
      return { allowed: false, reason: 'user administration requires super_admin or workspace_admin' };
    }

    // B2: a user may always delete their own memory (memory.md: "Users
    // can view, edit, and delete their own memories") — admins can
    // purge anyone's.
    case 'admin:memory:purge': {
      if (ctx.memoryOwnerId !== undefined && ctx.memoryOwnerId === user.id) {
        return { allowed: true };
      }
      if (user.role === 'super_admin' || user.role === 'workspace_admin') {
        return { allowed: true };
      }
      return { allowed: false, reason: 'can only delete your own memory, or requires super_admin/workspace_admin' };
    }

    // B4: the user who originally triggered the paused call may decide it
    // themselves (matches the natural in-chat UX — approving your own
    // agent's action), or an admin may (oversight). Both allowed, a
    // stated design decision, not an oversight-only gate.
    case 'approval:decide': {
      if (ctx.approvalRequesterId !== undefined && ctx.approvalRequesterId === user.id) {
        return { allowed: true };
      }
      if (user.role === 'super_admin' || user.role === 'workspace_admin') {
        return { allowed: true };
      }
      return { allowed: false, reason: 'can only decide your own approval, or requires super_admin/workspace_admin' };
    }

    case 'admin:traces:read':
    case 'admin:usage:read':
    case 'access_request:approve':
    case 'access_grant:read':
    case 'user:create':
    case 'group:manage':
    case 'admin:policies:read':
    case 'admin:policies:write':
    case 'admin:models:manage':
    case 'admin:agents:manage':
    case 'admin:memory:read':
    case 'admin:feedback:triage':
    case 'admin:system:read':
    case 'admin:conversation:read':
    case 'admin:audit:read': {
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
