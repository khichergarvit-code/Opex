import { describe, expect, it } from 'vitest';
import { adminScope, sameWorkspace } from './scope.js';
import { can } from './can.js';
import type { AuthedUser } from './types.js';

const WS_A = '11111111-1111-1111-1111-111111111111';
const WS_B = '22222222-2222-2222-2222-222222222222';

const user = (over: Partial<AuthedUser>): AuthedUser => ({
  id: 'u1',
  email: 'u@x',
  role: 'employee',
  clearance: 1,
  status: 'active',
  workspaceId: null,
  ...over,
});

describe('workspace isolation', () => {
  it('a super admin is unrestricted', () => {
    expect(adminScope(user({ role: 'super_admin' }))).toEqual({ all: true });
    expect(sameWorkspace(user({ role: 'super_admin' }), WS_B)).toBe(true);
  });

  it('a workspace admin is limited to their own workspace', () => {
    const admin = user({ role: 'workspace_admin', workspaceId: WS_A });
    expect(adminScope(admin)).toEqual({ all: false, workspaceId: WS_A });
    expect(sameWorkspace(admin, WS_A)).toBe(true);
    expect(sameWorkspace(admin, WS_B)).toBe(false);
    expect(sameWorkspace(admin, null)).toBe(false);
  });

  it('a workspace admin with no workspace matches nothing', () => {
    expect(sameWorkspace(user({ role: 'workspace_admin', workspaceId: null }), WS_A)).toBe(false);
  });

  it('can() refuses a workspace admin on another workspace resource but allows their own', () => {
    const admin = user({ role: 'workspace_admin', workspaceId: WS_A });
    expect(can(admin, 'document:read', { resourceWorkspaceId: WS_B }).allowed).toBe(false);
    expect(can(admin, 'conversation:read', { resourceWorkspaceId: WS_B }).allowed).toBe(false);
    expect(can(admin, 'document:read', { resourceWorkspaceId: WS_A }).allowed).toBe(true);
  });

  it('a super admin passes on any workspace', () => {
    expect(can(user({ role: 'super_admin' }), 'document:read', { resourceWorkspaceId: WS_B }).allowed).toBe(true);
  });

  it('platform-wide settings are super-admin only', () => {
    const admin = user({ role: 'workspace_admin', workspaceId: WS_A });
    for (const action of ['admin:models:manage', 'admin:agents:manage', 'admin:system:read'] as const) {
      expect(can(admin, action).allowed).toBe(false);
      expect(can(user({ role: 'super_admin' }), action).allowed).toBe(true);
    }
  });
});
