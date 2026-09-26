import { eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client.js';
import { projects, users } from '../db/schema/index.js';
import type { AuthedUser } from './types.js';

/**
 * Who an administrator may administer. A super admin sees every workspace; a workspace admin only their own.
 * Filters are built as SQL fragments so they run inside the query (never after fetching rows).
 */
export type AdminScope = { all: true } | { all: false; workspaceId: string | null };

export function adminScope(user: AuthedUser): AdminScope {
  if (user.role === 'super_admin') return { all: true };
  return { all: false, workspaceId: user.workspaceId ?? null };
}

/** Restricts a `user_id`-style column to people in the admin's workspace. Undefined = no restriction. */
export function inScopeUsers(user: AuthedUser, userIdCol: AnyPgColumn): SQL | undefined {
  const scope = adminScope(user);
  if (scope.all) return undefined;
  if (!scope.workspaceId) return sql`false`;
  return inArray(userIdCol, sql`(SELECT ${users.id} FROM ${users} WHERE ${users.workspaceId} = ${scope.workspaceId})`);
}

/** Restricts a `workspace_id` column to the admin's workspace. Undefined = no restriction. */
export function inScopeWorkspace(user: AuthedUser, workspaceIdCol: AnyPgColumn): SQL | undefined {
  const scope = adminScope(user);
  if (scope.all) return undefined;
  if (!scope.workspaceId) return sql`false`;
  return eq(workspaceIdCol, scope.workspaceId);
}

/** True when a resource in `workspaceId` may be touched by this user in an admin capacity. */
export function sameWorkspace(user: AuthedUser, workspaceId: string | null | undefined): boolean {
  if (user.role === 'super_admin') return true;
  return Boolean(workspaceId) && workspaceId === (user.workspaceId ?? null);
}

/** The workspace a project belongs to (null when the project does not exist), for policy checks. */
export async function projectWorkspaceId(db: Db, projectId: string): Promise<string | null> {
  const [row] = await db.select({ workspaceId: projects.workspaceId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  return row?.workspaceId ?? null;
}
