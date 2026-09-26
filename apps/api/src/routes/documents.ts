import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { Router, type Response } from 'express';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import type { Db } from '../db/client.js';
import { accessGrants, documents, jobs, projectMembers, projects, userGroups } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import { loadActivePolicyRules } from '../policy/loadPolicyRules.js';

/**
 * Magic-byte-verified mime types accepted for ingestion (documents.md
 * §Ingestion step 2: "PDF, DOCX, PPTX, XLSX/CSV, HTML, and images").
 * file-type can't sniff CSV/HTML (no reliable magic bytes) — those two are
 * allowed through on their declared extension/mime instead, checked below.
 */
const SNIFFABLE_ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'image/png',
  'image/jpeg',
  'image/tiff',
  'image/webp',
]);
const EXTENSION_ONLY_ALLOWED = new Set(['text/csv', 'text/html']);

const upload = multer({ storage: multer.memoryStorage() });

async function isProjectMember(db: Db, userId: string, projectId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.projectId, projectId)))
    .limit(1);
  return rows.length > 0;
}

function sendEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Loads a document row and runs the document:read check; sends the 404/403 response itself on failure. */
async function loadAndAuthorizeDocument(
  db: Db,
  req: import('express').Request,
  res: Response,
): Promise<(typeof documents.$inferSelect) | null> {
  const user = req.user!;
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, req.params.id as string))
    .limit(1);
  if (!doc) {
    res.status(404).json({ error: 'not found' });
    return null;
  }
  const member = await isProjectMember(db, user.id, doc.projectId);
  const userGroupRows = await db
    .select({ groupId: userGroups.groupId })
    .from(userGroups)
    .where(eq(userGroups.userId, user.id));
  // Mirrors retrieval/aclFilter.ts's `OR EXISTS (... access_grants ...)`
  // clause — the same grant that lets a chunk through retrieval must also
  // let the raw document file/page through this direct route.
  const [grant] = await db
    .select({ id: accessGrants.id })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.documentId, doc.id),
        eq(accessGrants.userId, user.id),
        or(isNull(accessGrants.expiresAt), gt(accessGrants.expiresAt, new Date())),
      ),
    )
    .limit(1);
  const decision = can(user, 'document:read', {
    projectId: doc.projectId,
    isProjectMember: member,
    documentClassification: doc.classification as 0 | 1 | 2 | 3,
    documentAclGroupIds: doc.aclGroupIds,
    userGroupIds: userGroupRows.map((r) => r.groupId),
    hasActiveAccessGrant: Boolean(grant),
  });
  if (!decision.allowed) {
    res.status(403).json({ error: decision.reason ?? 'forbidden' });
    return null;
  }
  return doc;
}

export function createDocumentsRouter(db: Db, dataDir: string): Router {
  const router = Router();

  router.post('/projects/:id/documents', requireAuth(db), upload.single('file'), async (req, res) => {
    const user = req.user!;
    const projectId = req.params.id as string;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'no file uploaded (expected multipart field "file")' });
      return;
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) {
      res.status(404).json({ error: 'project not found' });
      return;
    }

    const member = await isProjectMember(db, user.id, projectId);
    const rules = await loadActivePolicyRules(db, project.workspaceId);
    const decision = can(
      user,
      'document:upload',
      { projectId, isProjectMember: member, uploadSizeBytes: file.size },
      rules,
    );
    if (!decision.allowed) {
      const status = decision.reason?.includes('upload limit') ? 413 : 403;
      res.status(status).json({ error: decision.reason ?? 'forbidden' });
      return;
    }

    // Magic-byte check (documents.md step 1) — never trust the client's
    // declared mime/extension for sniffable formats.
    const detected = await fileTypeFromBuffer(file.buffer);
    const declaredMime = file.mimetype;
    const mime = detected?.mime ?? declaredMime;
    const sniffableOk = detected && SNIFFABLE_ALLOWED_MIMES.has(detected.mime);
    const extensionOk = !detected && EXTENSION_ONLY_ALLOWED.has(declaredMime);
    if (!sniffableOk && !extensionOk) {
      res.status(415).json({ error: `unsupported or unrecognized file type: ${mime}` });
      return;
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    const classification = req.body.classification
      ? Number(req.body.classification)
      : project.defaultClassification;

    const destDir = path.join(dataDir, 'files', project.workspaceId);
    await mkdir(destDir, { recursive: true });
    await writeFile(path.join(destDir, sha256), file.buffer);

    // Dedupe by (project_id, sha256) via ON CONFLICT DO NOTHING, not a
    // check-then-insert — a plain SELECT-then-INSERT has a real race
    // (two concurrent uploads of the same file both pass the check, the
    // second's INSERT then hits the unique constraint and 500s).
    const [inserted] = await db
      .insert(documents)
      .values({
        workspaceId: project.workspaceId,
        projectId,
        sha256,
        filename: file.originalname,
        mime,
        sizeBytes: file.size,
        classification,
        uploadedBy: user.id,
        status: 'queued',
      })
      .onConflictDoNothing({ target: [documents.projectId, documents.sha256] })
      .returning();

    if (inserted) {
      await db.insert(jobs).values({
        kind: 'ingest_document',
        payload: { documentId: inserted.id },
      });
      res.status(201).json(inserted);
      return;
    }

    const [existing] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.projectId, projectId), eq(documents.sha256, sha256)))
      .limit(1);
    // Uploading a file whose earlier ingest failed is a retry, not a duplicate.
    res.status(200).json(existing && existing.status === 'failed' ? await requeue(existing.id) : existing);
  });

  /** Puts a failed document back in the queue and returns the fresh row. */
  async function requeue(documentId: string) {
    const [row] = await db
      .update(documents)
      .set({ status: 'queued', errorMessage: null, pagesDone: 0 })
      .where(and(eq(documents.id, documentId), eq(documents.status, 'failed')))
      .returning();
    if (row) await db.insert(jobs).values({ kind: 'ingest_document', payload: { documentId } });
    const [current] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    return current;
  }

  router.post('/documents/:id/retry', requireAuth(db), async (req, res) => {
    const doc = await loadAndAuthorizeDocument(db, req, res);
    if (!doc) return;
    res.json(doc.status === 'failed' ? await requeue(doc.id) : doc);
  });

  router.get('/projects/:id/documents', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const projectId = req.params.id as string;
    const member = await isProjectMember(db, user.id, projectId);
    const decision = can(user, 'document:read', { projectId, isProjectMember: member });
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.projectId, projectId))
      .orderBy(desc(documents.createdAt));
    res.json(rows);
  });

  router.get('/documents/:id', requireAuth(db), async (req, res) => {
    const doc = await loadAndAuthorizeDocument(db, req, res);
    if (!doc) return;
    res.json(doc);
  });

  /** Streams the original uploaded bytes — used by the frontend's pdf.js viewer. */
  router.get('/documents/:id/file', requireAuth(db), async (req, res) => {
    const doc = await loadAndAuthorizeDocument(db, req, res);
    if (!doc) return;
    const filePath = path.resolve(dataDir, 'files', doc.workspaceId, doc.sha256);
    res.setHeader('content-type', doc.mime);
    res.setHeader('content-disposition', `inline; filename="${encodeURIComponent(doc.filename)}"`);
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: 'file not found on disk' });
      }
    });
  });

  /**
   * Polls documents.pages_done (updated by the ingest worker per page)
   * over SSE — avoids LISTEN/NOTIFY or a broker for a single-consumer
   * progress bar (see the plan's Open Question #7).
   */
  router.get('/documents/:id/progress', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const documentId = req.params.id as string;
    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    if (!doc) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const member = await isProjectMember(db, user.id, doc.projectId);
    if (!member && user.role === 'employee') {
      res.status(403).json({ error: 'not a project member' });
      return;
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    let lastPagesDone = -1;
    let lastStatus = '';
    const interval = setInterval(async () => {
      const [row] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
      if (!row) {
        clearInterval(interval);
        res.end();
        return;
      }
      if (row.pagesDone !== lastPagesDone || row.status !== lastStatus) {
        lastPagesDone = row.pagesDone;
        lastStatus = row.status;
        sendEvent(res, 'progress', {
          pagesDone: row.pagesDone,
          pageCount: row.pageCount,
          status: row.status,
        });
      }
      if (row.status === 'ready' || row.status === 'failed') {
        clearInterval(interval);
        res.end();
      }
    }, 500);

    req.on('close', () => clearInterval(interval));
  });

  return router;
}
