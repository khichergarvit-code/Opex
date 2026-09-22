import { describe, expect, it } from 'vitest';
import { can } from './can.js';
import { DEFAULT_POLICY_RULES, type PolicyRules } from './rules.js';
import type { Action, AuthedUser, PolicyContext } from './types.js';

function user(overrides: Partial<AuthedUser> = {}): AuthedUser {
  return { id: 'u1', email: 'u@opex.local', role: 'employee', clearance: 1, status: 'active', ...overrides };
}

interface Row {
  role: AuthedUser['role'];
  action: Action;
  ctx?: PolicyContext;
  rules?: PolicyRules;
  expected: boolean;
}

/**
 * The unified table-driven policy matrix — the literal artifact B1's AC
 * ("policy matrix tests green") demonstrates. Covers every Action value at
 * least once, across representative roles/contexts. can.test.ts keeps the
 * hand-written edge-case tests (missing modelRole, ACL group nuances, etc.)
 * that don't fit a flat table naturally.
 */
const MATRIX: Row[] = [
  { role: 'employee', action: 'login', expected: true },
  { role: 'super_admin', action: 'model:invoke', ctx: { modelRole: 'coder' }, expected: true },
  { role: 'employee', action: 'model:invoke', ctx: { modelRole: 'coder' }, expected: false },
  {
    role: 'employee',
    action: 'model:invoke',
    ctx: { modelRole: 'general', dailyTokensUsedToday: 5000 },
    rules: { ...DEFAULT_POLICY_RULES, dailyTokenQuota: { employee: 1000 } },
    expected: false,
  },
  {
    role: 'employee',
    action: 'model:invoke',
    ctx: { modelRole: 'general', dailyTokensUsedToday: 500 },
    rules: { ...DEFAULT_POLICY_RULES, dailyTokenQuota: { employee: 1000 } },
    expected: true,
  },
  { role: 'employee', action: 'conversation:create', ctx: { isProjectMember: true }, expected: true },
  { role: 'employee', action: 'conversation:create', ctx: { isProjectMember: false }, expected: false },
  { role: 'employee', action: 'conversation:read', ctx: { isProjectMember: true }, expected: true },
  { role: 'employee', action: 'conversation:message', ctx: { isProjectMember: true }, expected: true },
  { role: 'employee', action: 'document:upload', ctx: { isProjectMember: true }, expected: true },
  {
    role: 'employee',
    action: 'document:upload',
    ctx: { isProjectMember: true, uploadSizeBytes: 200 * 1024 * 1024 },
    expected: false,
  },
  { role: 'employee', action: 'document:read', ctx: { isProjectMember: true, documentClassification: 1 }, expected: true },
  { role: 'employee', action: 'document:read', ctx: { isProjectMember: true, documentClassification: 3 }, expected: false },
  {
    role: 'employee',
    action: 'tool:invoke',
    ctx: { toolName: 'code_exec', agentToolAllowlist: ['code_exec'] },
    expected: true,
  },
  {
    role: 'employee',
    action: 'tool:invoke',
    ctx: { toolName: 'code_exec', agentToolAllowlist: ['code_exec'] },
    rules: { ...DEFAULT_POLICY_RULES, allowedTools: { employee: ['doc_search'] } },
    expected: false,
  },
  { role: 'super_admin', action: 'admin:traces:read', expected: true },
  { role: 'employee', action: 'admin:traces:read', expected: false },
  { role: 'super_admin', action: 'admin:usage:read', expected: true },
  { role: 'employee', action: 'admin:usage:read', expected: false },
  { role: 'employee', action: 'access_request:create', ctx: { documentId: 'd1' }, expected: true },
  { role: 'employee', action: 'access_request:create', ctx: {}, expected: false },
  { role: 'super_admin', action: 'access_request:approve', expected: true },
  { role: 'workspace_admin', action: 'access_request:approve', expected: true },
  { role: 'employee', action: 'access_request:approve', expected: false },
  { role: 'employee', action: 'access_grant:read', expected: false },
  { role: 'workspace_admin', action: 'access_grant:read', expected: true },
  { role: 'super_admin', action: 'user:create', expected: true },
  { role: 'workspace_admin', action: 'user:create', expected: true },
  { role: 'employee', action: 'user:create', expected: false },
  { role: 'super_admin', action: 'user:disable', ctx: { targetUserId: 'u2' }, expected: true },
  { role: 'super_admin', action: 'user:disable', ctx: { targetUserId: 'u1' }, expected: false },
  { role: 'employee', action: 'user:disable', ctx: { targetUserId: 'u2' }, expected: false },
  { role: 'workspace_admin', action: 'group:manage', expected: true },
  { role: 'employee', action: 'group:manage', expected: false },
  { role: 'workspace_admin', action: 'admin:policies:read', expected: true },
  { role: 'employee', action: 'admin:policies:read', expected: false },
  { role: 'workspace_admin', action: 'admin:policies:write', expected: true },
  { role: 'employee', action: 'admin:policies:write', expected: false },
  { role: 'workspace_admin', action: 'admin:models:manage', expected: true },
  { role: 'employee', action: 'admin:models:manage', expected: false },
  { role: 'workspace_admin', action: 'admin:agents:manage', expected: true },
  { role: 'employee', action: 'admin:agents:manage', expected: false },
  { role: 'workspace_admin', action: 'admin:memory:read', expected: true },
  { role: 'employee', action: 'admin:memory:read', expected: false },
  { role: 'workspace_admin', action: 'admin:memory:purge', expected: true },
  { role: 'employee', action: 'admin:memory:purge', expected: false },
  { role: 'workspace_admin', action: 'admin:feedback:triage', expected: true },
  { role: 'employee', action: 'admin:feedback:triage', expected: false },
  { role: 'workspace_admin', action: 'admin:system:read', expected: true },
  { role: 'employee', action: 'admin:system:read', expected: false },
  { role: 'workspace_admin', action: 'admin:conversation:read', expected: true },
  { role: 'employee', action: 'admin:conversation:read', expected: false },
  { role: 'workspace_admin', action: 'admin:audit:read', expected: true },
  { role: 'employee', action: 'admin:audit:read', expected: false },
];

describe('can() — unified policy matrix', () => {
  it.each(MATRIX.map((row, i) => ({ ...row, i })))(
    '#%#: role=$role action=$action -> allowed=$expected',
    ({ role, action, ctx, rules, expected }) => {
      const decision = can(user({ role }), action, ctx ?? {}, rules ?? DEFAULT_POLICY_RULES);
      expect(decision.allowed).toBe(expected);
    },
  );

  it('covers every Action value at least once', () => {
    const covered = new Set(MATRIX.map((r) => r.action));
    const allActions: Action[] = [
      'login', 'model:invoke', 'conversation:create', 'conversation:read', 'conversation:message',
      'document:upload', 'document:read', 'tool:invoke', 'admin:traces:read', 'admin:usage:read',
      'access_request:create', 'access_request:approve', 'access_grant:read', 'user:create',
      'user:disable', 'group:manage', 'admin:policies:read', 'admin:policies:write',
      'admin:models:manage', 'admin:agents:manage', 'admin:memory:read', 'admin:memory:purge',
      'admin:feedback:triage', 'admin:system:read', 'admin:conversation:read', 'admin:audit:read',
    ];
    for (const action of allActions) {
      expect(covered.has(action)).toBe(true);
    }
  });
});
