import { readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import type { Db } from '../db/client.js';
import type { AuditWriter } from '../audit/writeAudit.js';
import { projectMembers, projects, users } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { resolveInWorkspace, workspaceRoot } from '../orchestrator/tools/workspace.js';

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_VIEW_BYTES = 512_000;
const IMAGE_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const TEXT_MIME: Record<string, string> = {
  '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv', '.tsv': 'text/tab-separated-values', '.json': 'application/json',
  '.log': 'text/plain', '.py': 'text/x-python', '.html': 'text/plain', '.yaml': 'text/yaml', '.yml': 'text/yaml', '.xml': 'application/xml',
};

export interface WorkspaceEntry {
  path: string;
  isDir: boolean;
  sizeBytes: number;
  modifiedAt: string;
  projectId: string;
  projectName: string;
  userId: string;
  owner: string;
}

const isAdminRole = (role: string) => role === 'super_admin' || role === 'workspace_admin';

/**
 * A user's files live in data/workspaces/<project>/<user>/. Everyone sees their own; workspace admins and super admins
 * may list, open, download and delete anyone's (those actions are audit-logged).
 */
export function createWorkspaceRouter(db: Db, auditWriter: AuditWriter, dataDir: string): Router {
  const router = Router();

  async function authorize(
    user: { id: string; role: string },
    projectId: string,
    targetUserId: string,
  ): Promise<'self' | 'admin' | null> {
    if (!UUID.test(projectId) || !UUID.test(targetUserId)) return null;
    if (isAdminRole(user.role)) return targetUserId === user.id ? 'self' : 'admin';
    if (targetUserId !== user.id) return null;
    const [m] = await db.select().from(projectMembers).where(and(eq(projectMembers.userId, user.id), eq(projectMembers.projectId, projectId))).limit(1);
    return m ? 'self' : null;
  }

  async function scanDir(root: string, ctx: { projectId: string; projectName: string; userId: string; owner: string }): Promise<WorkspaceEntry[]> {
    const out: WorkspaceEntry[] = [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (out.length >= 1000) return;
        const abs = path.join(dir, entry.name);
        const st = await stat(abs).catch(() => null);
        if (!st) continue;
        const rel = path.relative(root, abs).split(path.sep).join('/');
        if (entry.isDirectory()) {
          out.push({ ...ctx, path: rel, isDir: true, sizeBytes: 0, modifiedAt: st.mtime.toISOString() });
          await walk(abs);
        } else if (entry.isFile()) {
          out.push({ ...ctx, path: rel, isDir: false, sizeBytes: st.size, modifiedAt: st.mtime.toISOString() });
        }
      }
    };
    await walk(root);
    return out;
  }

  // List files: your own for a project, or (admins) everyone's with ?all=1.
  router.get('/workspace/files', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const projectRows = await db.select({ id: projects.id, name: projects.name }).from(projects);
    const names = new Map(projectRows.map((p) => [p.id, p.name]));

    if (req.query.all === '1') {
      if (!isAdminRole(user.role)) return void res.status(403).json({ error: 'forbidden' });
      const base = path.resolve(dataDir, 'workspaces');
      const found: Array<{ projectId: string; userId: string }> = [];
      for (const p of await readdir(base, { withFileTypes: true }).catch(() => [])) {
        if (!p.isDirectory() || !UUID.test(p.name)) continue;
        for (const u of await readdir(path.join(base, p.name), { withFileTypes: true }).catch(() => [])) {
          if (u.isDirectory() && UUID.test(u.name)) found.push({ projectId: p.name, userId: u.name });
        }
      }
      const emails = new Map(
        found.length ? (await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, [...new Set(found.map((f) => f.userId))]))).map((u) => [u.id, u.email]) : [],
      );
      const all: WorkspaceEntry[] = [];
      for (const f of found) {
        all.push(...(await scanDir(path.join(base, f.projectId, f.userId), { ...f, projectName: names.get(f.projectId) ?? f.projectId, owner: emails.get(f.userId) ?? f.userId })));
      }
      return void res.json(all.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)));
    }

    const projectId = String(req.query.projectId ?? '');
    const targetUserId = String(req.query.userId ?? user.id);
    if (!(await authorize(user, projectId, targetUserId))) return void res.status(403).json({ error: 'forbidden' });
    const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, targetUserId)).limit(1);
    const rows = await scanDir(workspaceRoot(dataDir, { projectId, userId: targetUserId }), {
      projectId, projectName: names.get(projectId) ?? projectId, userId: targetUserId, owner: owner?.email ?? targetUserId,
    });
    res.json(rows.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)));
  });

  // Open (inline, size-limited) or download one file.
  router.get('/workspace/file', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const projectId = String(req.query.projectId ?? '');
    const targetUserId = String(req.query.userId ?? user.id);
    const rel = String(req.query.path ?? '');
    const access = await authorize(user, projectId, targetUserId);
    if (!access) return void res.status(403).json({ error: 'forbidden' });
    try {
      const { abs, rel: cleaned } = await resolveInWorkspace(dataDir, { projectId, userId: targetUserId }, rel, { requireExtension: false });
      const st = await stat(abs);
      if (!st.isFile()) return void res.status(404).json({ error: 'not a file' });
      const ext = path.extname(cleaned).toLowerCase();
      const download = req.query.download === '1';
      if (!download && st.size > MAX_VIEW_BYTES) return void res.status(413).json({ error: 'too large to open here; download it instead' });
      if (access === 'admin') await auditWriter.writeAudit({ actorId: user.id, action: download ? 'workspace.download' : 'workspace.open', resource: `${targetUserId}/${cleaned}`, details: { projectId } });
      const mime = IMAGE_MIME[ext] ?? TEXT_MIME[ext] ?? 'application/octet-stream';
      res.setHeader('content-type', mime.startsWith('text/') ? `${mime}; charset=utf-8` : mime);
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('content-disposition', `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(path.basename(cleaned))}"`);
      res.send(await readFile(abs));
    } catch (err) {
      res.status(err instanceof Error && /ENOENT/.test(err.message) ? 404 : 400).json({ error: err instanceof Error && /ENOENT/.test(err.message) ? 'file not found' : 'invalid path' });
    }
  });

  router.delete('/workspace/file', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const projectId = String(req.query.projectId ?? '');
    const targetUserId = String(req.query.userId ?? user.id);
    const rel = String(req.query.path ?? '');
    if (!(await authorize(user, projectId, targetUserId))) return void res.status(403).json({ error: 'forbidden' });
    try {
      const { abs, rel: cleaned } = await resolveInWorkspace(dataDir, { projectId, userId: targetUserId }, rel, { requireExtension: false });
      const st = await stat(abs);
      await rm(abs, { recursive: st.isDirectory(), force: true });
      await auditWriter.writeAudit({ actorId: user.id, action: 'workspace.delete', resource: `${targetUserId}/${cleaned}`, details: { projectId, folder: st.isDirectory() } });
      res.json({ deleted: 1 });
    } catch {
      res.status(404).json({ error: 'not found' });
    }
  });

  return router;
}
