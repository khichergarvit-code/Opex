import type { Classification, Role } from '@opex/shared';

export interface AuthedUser {
  id: string;
  email: string;
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
  | 'admin:usage:read';

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
  /** Present for tool:invoke — the tool name and the calling agent's allowlist. */
  toolName?: string;
  agentToolAllowlist?: string[];
  /** Present for tool:invoke — the current task's classification floor (invariant #10). */
  taskClassification?: Classification;
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}
