import { lstat, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';

/** Text formats the agent may create or read by default. */
export const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.log', '.py', '.html', '.yaml', '.yml', '.xml', '.tsv']);
export const MAX_WRITE_BYTES = 1_000_000;
export const MAX_READ_BYTES = 256_000;

export class WorkspacePathError extends Error {}

/** Whose workspace: files are private per person inside a project (data/workspaces/<project>/<user>/). */
export interface WorkspaceScope {
  projectId: string;
  userId: string;
}

const UUID = /^[0-9a-f-]{36}$/i;

export function workspaceRoot(dataDir: string, scope: WorkspaceScope): string {
  if (!UUID.test(scope.projectId) || !UUID.test(scope.userId)) throw new WorkspacePathError('invalid workspace');
  return path.resolve(dataDir, 'workspaces', scope.projectId, scope.userId);
}

export const scopeOf = (ctx: { projectId: string; user: { id: string } }): WorkspaceScope => ({ projectId: ctx.projectId, userId: ctx.user.id });

/**
 * Turns a user/model supplied relative path into an absolute path that is guaranteed to be inside the
 * project's workspace: no absolute paths, no `..`, no odd characters, only allowed extensions, and no
 * symlink anywhere along the way that leads outside.
 */
export async function resolveInWorkspace(
  dataDir: string,
  scope: WorkspaceScope,
  relPath: string,
  opts: { requireExtension?: boolean } = {},
): Promise<{ root: string; abs: string; rel: string }> {
  const root = workspaceRoot(dataDir, scope);
  const rel = relPath.trim().replace(/\\/g, '/');
  if (!rel || rel.length > 200) throw new WorkspacePathError('a file name is required (max 200 characters)');
  if (rel.startsWith('/') || /^[a-zA-Z]:/.test(rel)) throw new WorkspacePathError('use a relative file name, not an absolute path');
  if (rel.split('/').some((part) => part === '..' || part === '.' || part === '')) throw new WorkspacePathError('paths may not contain "..", "." or empty parts');
  if (!/^[\w\-. /]+$/.test(rel)) throw new WorkspacePathError('file names may only contain letters, numbers, spaces, dashes, underscores and dots');
  const ext = path.extname(rel).toLowerCase();
  if (opts.requireExtension !== false && !ALLOWED_EXTENSIONS.has(ext)) {
    throw new WorkspacePathError(`only these file types are allowed: ${[...ALLOWED_EXTENSIONS].join(' ')}`);
  }
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new WorkspacePathError('path escapes the workspace');

  await mkdir(root, { recursive: true });
  const realRoot = await realpath(root);
  // Walk every existing segment: none may be a symlink pointing outside the workspace.
  let current = root;
  for (const part of rel.split('/')) {
    current = path.join(current, part);
    const st = await lstat(current).catch(() => null);
    if (!st) break;
    if (st.isSymbolicLink()) {
      const target = await realpath(current).catch(() => null);
      if (!target || (target !== realRoot && !target.startsWith(realRoot + path.sep))) throw new WorkspacePathError('symbolic links out of the workspace are not allowed');
    }
  }
  return { root, abs, rel };
}
