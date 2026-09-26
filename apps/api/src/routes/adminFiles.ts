import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { and, count, desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import type { Db } from '../db/client.js';
import type { AuditWriter } from '../audit/writeAudit.js';
import { artifacts, documents, projects, users } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import { inScopeWorkspace, sameWorkspace } from '../policy/scope.js';

export type FileKind = 'document' | 'artifact' | 'workspace';

export interface AdminFileRow {
  id: string;
  kind: FileKind;
  name: string;
  projectId: string;
  projectName: string;
  owner: string | null;
  sizeBytes: number;
  mime: string;
  classification: number | null;
  status: string | null;
  createdAt: string;
  downloadUrl: string;
  conversationId: string | null;
}

const encodeWorkspaceId = (scope: string, rel: string) => Buffer.from(`${scope}/${rel}`).toString('base64url');
export function decodeWorkspaceId(id: string): { projectId: string; userId: string; rel: string } | null {
  const raw = Buffer.from(id, 'base64url').toString('utf8');
  const m = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\/(.+)$/i.exec(raw);
  if (!m || m[3]!.split('/').some((p) => p === '..' || p === '.' || p === '')) return null;
  return { projectId: m[1]!, userId: m[2]!, rel: m[3]! };
}

async function scanWorkspaces(dataDir: string, projectNames: Map<string, string>, emails: Map<string, string>): Promise<AdminFileRow[]> {
  const base = path.resolve(dataDir, 'workspaces');
  const out: AdminFileRow[] = [];
  const walk = async (dir: string, projectId: string, userId: string, root: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(abs, projectId, userId, root);
      else if (entry.isFile() && out.length < 2000) {
        const st = await stat(abs);
        const rel = path.relative(root, abs).split(path.sep).join('/');
        out.push({
          id: encodeWorkspaceId(`${projectId}/${userId}`, rel),
          kind: 'workspace',
          name: rel,
          projectId,
          projectName: projectNames.get(projectId) ?? projectId,
          owner: emails.get(userId) ?? userId,
          sizeBytes: st.size,
          mime: 'text/plain',
          classification: null,
          status: null,
          createdAt: st.mtime.toISOString(),
          downloadUrl: `/workspace/file?projectId=${projectId}&userId=${userId}&path=${encodeURIComponent(rel)}&download=1`,
          conversationId: null,
        });
      }
    }
  };
  for (const p of await readdir(base, { withFileTypes: true }).catch(() => [])) {
    if (!p.isDirectory() || !/^[0-9a-f-]{36}$/i.test(p.name)) continue;
    for (const u of await readdir(path.join(base, p.name), { withFileTypes: true }).catch(() => [])) {
      if (u.isDirectory() && /^[0-9a-f-]{36}$/i.test(u.name)) await walk(path.join(base, p.name, u.name), p.name, u.name, path.join(base, p.name, u.name));
    }
  }
  return out;
}

/** Admin "Files": everything uploaded or created, in one place, with download/delete audited. */
export function createAdminFilesRouter(db: Db, auditWriter: AuditWriter, dataDir: string): Router {
  const router = Router();

  router.get('/admin/files', requireAuth(db), async (req, res) => {
    const decision = can(req.user!, 'admin:conversation:read');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const projectRows = await db.select({ id: projects.id, name: projects.name }).from(projects).where(inScopeWorkspace(req.user!, projects.workspaceId));
    const projectNames = new Map(projectRows.map((p) => [p.id, p.name]));

    const docs = await db
      .select({
        id: documents.id, name: documents.filename, projectId: documents.projectId, owner: users.email, sizeBytes: documents.sizeBytes,
        mime: documents.mime, classification: documents.classification, status: documents.status, createdAt: documents.createdAt,
      })
      .from(documents)
      .leftJoin(users, eq(users.id, documents.uploadedBy))
      .where(inScopeWorkspace(req.user!, documents.workspaceId))
      .orderBy(desc(documents.createdAt))
      .limit(1000);
    const arts = await db
      .select({
        id: artifacts.id, name: artifacts.filename, projectId: artifacts.projectId, owner: users.email, sizeBytes: artifacts.sizeBytes,
        mime: artifacts.mime, classification: artifacts.classification, kind: artifacts.kind, createdAt: artifacts.createdAt, conversationId: artifacts.conversationId,
      })
      .from(artifacts)
      .leftJoin(users, eq(users.id, artifacts.createdBy))
      .where(inScopeWorkspace(req.user!, artifacts.workspaceId))
      .orderBy(desc(artifacts.createdAt))
      .limit(1000);

    const rows: AdminFileRow[] = [
      ...docs.map<AdminFileRow>((d) => ({
        id: d.id, kind: 'document', name: d.name, projectId: d.projectId, projectName: projectNames.get(d.projectId) ?? d.projectId,
        owner: d.owner, sizeBytes: d.sizeBytes, mime: d.mime, classification: d.classification, status: d.status,
        createdAt: d.createdAt.toISOString(), downloadUrl: `/documents/${d.id}/file`, conversationId: null,
      })),
      ...arts.map<AdminFileRow>((a) => ({
        id: a.id, kind: 'artifact', name: a.name, projectId: a.projectId, projectName: projectNames.get(a.projectId) ?? a.projectId,
        owner: a.owner, sizeBytes: a.sizeBytes, mime: a.mime, classification: a.classification, status: a.kind,
        createdAt: a.createdAt.toISOString(), downloadUrl: `/artifacts/${a.id}`, conversationId: a.conversationId,
      })),
      // Only projects in the admin's scope are in projectNames, so other workspaces' folders drop out here.
      ...(await scanWorkspaces(dataDir, projectNames, new Map((await db.select({ id: users.id, email: users.email }).from(users)).map((u) => [u.id, u.email])))).filter((r) => projectNames.has(r.projectId)),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const totals = {
      count: rows.length,
      bytes: rows.reduce((n, r) => n + r.sizeBytes, 0),
      byKind: { document: docs.length, artifact: arts.length, workspace: rows.filter((r) => r.kind === 'workspace').length },
    };
    res.json({ rows, totals });
  });

  router.delete('/admin/files/:kind/:id', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const decision = can(user, 'admin:policies:write');
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const kind = req.params.kind as FileKind;
    const id = req.params.id as string;
    let name = id;
    if (kind === 'document') {
      const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
      if (!doc || !sameWorkspace(user, doc.workspaceId)) return void res.status(404).json({ error: 'not found' });
      name = doc.filename;
      await db.delete(documents).where(eq(documents.id, id));
      const [others] = await db
        .select({ n: count() })
        .from(documents)
        .where(and(eq(documents.workspaceId, doc.workspaceId), eq(documents.sha256, doc.sha256)));
      if (!others || others.n === 0) await rm(path.resolve(dataDir, 'files', doc.workspaceId, doc.sha256), { force: true }).catch(() => {});
    } else if (kind === 'artifact') {
      const [art] = await db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
      if (!art || !sameWorkspace(user, art.workspaceId)) return void res.status(404).json({ error: 'not found' });
      name = art.filename;
      await db.delete(artifacts).where(eq(artifacts.id, id));
      await rm(path.resolve(dataDir, art.storagePath), { force: true }).catch(() => {});
    } else if (kind === 'workspace') {
      const w = decodeWorkspaceId(id);
      if (!w) return void res.status(400).json({ error: 'invalid id' });
      const [proj] = await db.select({ workspaceId: projects.workspaceId }).from(projects).where(eq(projects.id, w.projectId)).limit(1);
      if (!proj || !sameWorkspace(user, proj.workspaceId)) return void res.status(404).json({ error: 'not found' });
      const root = path.resolve(dataDir, 'workspaces', w.projectId, w.userId);
      const abs = path.resolve(root, w.rel);
      if (!abs.startsWith(root + path.sep)) return void res.status(400).json({ error: 'invalid path' });
      await stat(abs).catch(() => null).then((s) => (s ? rm(abs) : undefined));
      name = w.rel;
    } else {
      return void res.status(400).json({ error: 'unknown kind' });
    }
    await auditWriter.writeAudit({ actorId: user.id, action: 'file.admin_delete', resource: `${kind}:${id}`, details: { name } });
    res.json({ deleted: 1 });
  });

  return router;
}
