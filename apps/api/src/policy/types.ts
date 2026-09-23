import type { Classification, Role } from '@opex/shared';

export interface AuthedUser {
  id: string;
  email: string;
  /** Not needed for any policy decision — optional so call sites that build a synthetic AuthedUser for can() don't need it. */
  name?: string;
  role: Role;
  clearance: Classification;
  status: 'active' | 'disabled';
}

export type Action =
  | 'login'
  | 'model:invoke'
  | 'conversation:create'
  | 'conversation:read'
  | 'conversation:message'
  | 'document:upload'
  | 'document:read'
  | 'tool:invoke'
  | 'admin:traces:read'
  | 'admin:usage:read'
  | 'access_request:create'
  | 'access_request:approve'
  | 'access_grant:read'
  | 'user:create'
  | 'user:disable'
  | 'group:manage'
  | 'admin:policies:read'
  | 'admin:policies:write'
  | 'admin:models:manage'
  | 'admin:agents:manage'
  | 'admin:memory:read'
  | 'admin:memory:purge'
  | 'approval:decide'
  | 'admin:feedback:triage'
  | 'admin:system:read'
  | 'admin:conversation:read'
  | 'admin:audit:read';

export interface PolicyContext {
  /** Present for conversation:* and document:* actions — the project in scope. */
  projectId?: string;
  /** Present for model:invoke — the model role being requested (router|general|...). */
  modelRole?: string;
  /** Whether the acting user is a member of the project in scope, if applicable. */
  isProjectMember?: boolean;
  /** Present for document:read — the document's classification and ACL groups. */
  documentClassification?: Classification;
  documentAclGroupIds?: string[];
  userGroupIds?: string[];
  /**
   * Present for document:read — whether the caller already found a live
   * (non-expired) access_grants row for this user+document. Mirrors
   * retrieval/aclFilter.ts's `OR EXISTS (... access_grants ...)` clause,
   * just computed by the caller and passed in rather than inline SQL,
   * since document:read isn't itself a chunk-level SQL query.
   */
  hasActiveAccessGrant?: boolean;
  /** Present for tool:invoke — the tool name and the calling agent's allowlist. */
  toolName?: string;
  agentToolAllowlist?: string[];
  /** Present for tool:invoke — the current task's classification floor (invariant #10). */
  taskClassification?: Classification;
  /** Present for access_request:create — the document being requested. */
  documentId?: string;
  /** Present for user:disable — guards against a self-disable lockout. */
  targetUserId?: string;
  /** Present for model:invoke — today's token usage, for dailyTokenQuota. */
  dailyTokensUsedToday?: number;
  /** Present for document:upload — moves the size check inside can(). */
  uploadSizeBytes?: number;
  /** Present for admin:memory:purge — allows a user to delete their own memory. */
  memoryOwnerId?: string;
  /** Present for approval:decide — the user who originally triggered the paused call. */
  approvalRequesterId?: string;
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}
