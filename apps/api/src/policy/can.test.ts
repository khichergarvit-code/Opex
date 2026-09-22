import { describe, expect, it } from 'vitest';
import { can } from './can.js';
import { DEFAULT_POLICY_RULES } from './rules.js';
import type { AuthedUser } from './types.js';

function user(overrides: Partial<AuthedUser> = {}): AuthedUser {
  return {
    id: 'u1',
    email: 'u@opex.local',
    name: 'User',
    role: 'employee',
    clearance: 1,
    status: 'active',
    ...overrides,
  };
}

describe('can() — login', () => {
  it('allows an active user', () => {
    expect(can(user(), 'login').allowed).toBe(true);
  });

  it('denies a disabled user', () => {
    expect(can(user({ status: 'disabled' }), 'login').allowed).toBe(false);
  });
});

describe('can() — model:invoke', () => {
  const matrix: Array<[AuthedUser['role'], string, boolean]> = [
    ['super_admin', 'coder', true],
    ['super_admin', 'vision', true],
    ['workspace_admin', 'coder', true],
    ['employee', 'general', true],
    ['employee', 'router', true],
    ['employee', 'embed', true],
    ['employee', 'coder', false],
    ['employee', 'vision', false],
  ];

  it.each(matrix)('role=%s modelRole=%s -> allowed=%s', (role, modelRole, expected) => {
    const decision = can(user({ role }), 'model:invoke', { modelRole }, DEFAULT_POLICY_RULES);
    expect(decision.allowed).toBe(expected);
  });

  it('denies when modelRole is missing from context', () => {
    expect(can(user(), 'model:invoke', {}).allowed).toBe(false);
  });
});

describe('can() — conversation and document:upload actions', () => {
  const actions = [
    'conversation:create',
    'conversation:read',
    'conversation:message',
    'document:upload',
  ] as const;

  it.each(actions)('%s: admins bypass project membership', (action) => {
    expect(can(user({ role: 'super_admin' }), action, { isProjectMember: false }).allowed).toBe(
      true,
    );
    expect(
      can(user({ role: 'workspace_admin' }), action, { isProjectMember: false }).allowed,
    ).toBe(true);
  });

  it.each(actions)('%s: employees need project membership', (action) => {
    expect(can(user({ role: 'employee' }), action, { isProjectMember: false }).allowed).toBe(
      false,
    );
    expect(can(user({ role: 'employee' }), action, { isProjectMember: true }).allowed).toBe(true);
  });
});

describe('can() — document:read', () => {
  it('denies when the user lacks project membership', () => {
    expect(
      can(user({ role: 'employee' }), 'document:read', { isProjectMember: false }).allowed,
    ).toBe(false);
  });

  it('denies when clearance is below the document classification', () => {
    const decision = can(user({ role: 'employee', clearance: 1 }), 'document:read', {
      isProjectMember: true,
      documentClassification: 2,
    });
    expect(decision.allowed).toBe(false);
  });

  it('allows when clearance meets the document classification and there are no ACL groups', () => {
    const decision = can(user({ role: 'employee', clearance: 2 }), 'document:read', {
      isProjectMember: true,
      documentClassification: 2,
    });
    expect(decision.allowed).toBe(true);
  });

  it('denies when the document has ACL groups the user is not in', () => {
    const decision = can(user({ role: 'employee', clearance: 3 }), 'document:read', {
      isProjectMember: true,
      documentClassification: 1,
      documentAclGroupIds: ['group-a'],
      userGroupIds: ['group-b'],
    });
    expect(decision.allowed).toBe(false);
  });

  it('allows when the user is in one of the document ACL groups', () => {
    const decision = can(user({ role: 'employee', clearance: 3 }), 'document:read', {
      isProjectMember: true,
      documentClassification: 1,
      documentAclGroupIds: ['group-a'],
      userGroupIds: ['group-a'],
    });
    expect(decision.allowed).toBe(true);
  });

  it('allows when an active access grant exists, even above clearance and outside ACL groups', () => {
    const decision = can(user({ role: 'employee', clearance: 0 }), 'document:read', {
      isProjectMember: true,
      documentClassification: 3,
      documentAclGroupIds: ['group-a'],
      userGroupIds: [],
      hasActiveAccessGrant: true,
    });
    expect(decision.allowed).toBe(true);
  });

  it('admins bypass classification and ACL groups', () => {
    const decision = can(user({ role: 'super_admin', clearance: 0 }), 'document:read', {
      isProjectMember: false,
      documentClassification: 3,
      documentAclGroupIds: ['group-a'],
      userGroupIds: [],
    });
    expect(decision.allowed).toBe(true);
  });
});

describe('can() — tool:invoke', () => {
  it('denies a tool not in the agent allowlist', () => {
    const decision = can(user(), 'tool:invoke', {
      toolName: 'code_exec',
      agentToolAllowlist: ['doc_search'],
    });
    expect(decision.allowed).toBe(false);
  });

  it('allows a tool that is in the agent allowlist', () => {
    const decision = can(user(), 'tool:invoke', {
      toolName: 'code_exec',
      agentToolAllowlist: ['code_exec', 'make_chart'],
    });
    expect(decision.allowed).toBe(true);
  });

  it('denies an egress-capable tool once the task touches Confidential+ data', () => {
    const decision = can(
      user(),
      'tool:invoke',
      { toolName: 'web_search', agentToolAllowlist: ['web_search'], taskClassification: 2 },
      { ...DEFAULT_POLICY_RULES, egressCapableTools: ['web_search'] },
    );
    expect(decision.allowed).toBe(false);
  });

  it('allows a non-egress-capable tool even when the task touches Confidential+ data', () => {
    const decision = can(
      user(),
      'tool:invoke',
      { toolName: 'code_exec', agentToolAllowlist: ['code_exec'], taskClassification: 3 },
      DEFAULT_POLICY_RULES,
    );
    expect(decision.allowed).toBe(true);
  });
});

describe('can() — admin:traces:read / admin:usage:read', () => {
  const actions = ['admin:traces:read', 'admin:usage:read'] as const;

  it.each(actions)('%s: allows super_admin and workspace_admin', (action) => {
    expect(can(user({ role: 'super_admin' }), action).allowed).toBe(true);
    expect(can(user({ role: 'workspace_admin' }), action).allowed).toBe(true);
  });

  it.each(actions)('%s: denies employee', (action) => {
    expect(can(user({ role: 'employee' }), action).allowed).toBe(false);
  });
});
