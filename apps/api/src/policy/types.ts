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
  | 'conversation:message';

export interface PolicyContext {
  /** Present for conversation:* actions — the project the conversation belongs to. */
  projectId?: string;
  /** Present for model:invoke — the model role being requested (router|general|...). */
  modelRole?: string;
  /** Whether the acting user is a member of the project in scope, if applicable. */
  isProjectMember?: boolean;
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}
