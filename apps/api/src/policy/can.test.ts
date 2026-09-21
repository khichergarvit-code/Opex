import { describe, expect, it } from 'vitest';
import { can } from './can.js';
import { DEFAULT_POLICY_RULES } from './rules.js';
import type { AuthedUser } from './types.js';

function user(overrides: Partial<AuthedUser> = {}): AuthedUser {
  return {
    id: 'u1',
    email: 'u@opex.local',
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

describe('can() — conversation actions', () => {
  const actions = ['conversation:create', 'conversation:read', 'conversation:message'] as const;

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
