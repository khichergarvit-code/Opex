import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import multer from 'multer';
import type { Db } from '../db/client.js';
import { artifacts, conversations, projectMembers, traces } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import type { AuthedUser } from '../policy/types.js';

const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });

const EXTENSION_BY_MIME: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

/** Trust the bytes, not the client's Content-Type: the signature must match an allowed image format. */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

async function isProjectMember(db: Db, userId: string, projectId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.projectId, projectId)))
    .limit(1);
  return rows.length > 0;
}

export interface LoadedAttachment {
  id: string;
  filename: string;
  mime: string;
  classification: number;
  dataUri: string;
}

/** Loads the caller's own uploads for this conversation as data: URIs (bytes never leave the room). */
export async function loadAttachments(
  db: Db,
  dataDir: string,
  user: AuthedUser,
  conversationId: string,
  ids: string[],
): Promise<LoadedAttachment[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(artifacts)
    .where(and(inArray(artifacts.id, ids), eq(artifacts.conversationId, conversationId), eq(artifacts.createdBy, user.id), eq(artifacts.kind, 'upload')));
  const loaded: LoadedAttachment[] = [];
  for (const row of rows) {
    const bytes = await readFile(path.resolve(dataDir, row.storagePath));
    loaded.push({
      id: row.id,
      filename: row.filename,
      mime: row.mime,
      classification: row.classification,
      dataUri: `data:${row.mime};base64,${bytes.toString('base64')}`,
    });
  }
  return loaded;
}

export function createAttachmentsRouter(db: Db, dataDir: string): Router {
  const router = Router();

  router.post('/conversations/:id/attachments', requireAuth(db), upload.single('file'), async (req, res) => {
    const user = req.user!;
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, req.params.id as string)).limit(1);
    if (!conversation || conversation.userId !== user.id) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const member = await isProjectMember(db, user.id, conversation.projectId);
    const decision = can(user, 'conversation:message', { projectId: conversation.projectId, isProjectMember: member, resourceWorkspaceId: conversation.workspaceId });
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'attach an image file' });
      return;
    }
    const mime = sniffImageMime(file.buffer);
    if (!mime) {
      res.status(415).json({ error: 'only PNG, JPEG or WebP images can be attached' });
      return;
    }

    // Classification: what the uploader says it is (default Internal), never above their own clearance.
    const requested = Number(req.body?.classification ?? 1);
    const classification = Math.max(0, Math.min(Number.isFinite(requested) ? Math.trunc(requested) : 1, user.clearance)) as 0 | 1 | 2 | 3;

    const [trace] = await db
      .insert(traces)
      .values({ userId: user.id, conversationId: conversation.id, status: 'ok', endedAt: new Date() })
      .returning();
    if (!trace) throw new Error('failed to open trace for upload');

    const safeName = `${randomUUID()}${EXTENSION_BY_MIME[mime]}`;
    const destDir = path.resolve(dataDir, 'artifacts', conversation.workspaceId, trace.id);
    await mkdir(destDir, { recursive: true });
    await writeFile(path.join(destDir, safeName), file.buffer);

    const [row] = await db
      .insert(artifacts)
      .values({
        traceId: trace.id,
        conversationId: conversation.id,
        workspaceId: conversation.workspaceId,
        projectId: conversation.projectId,
        kind: 'upload',
        filename: path.basename(file.originalname).slice(0, 120) || safeName,
        mime,
        sizeBytes: file.buffer.byteLength,
        storagePath: path.join('artifacts', conversation.workspaceId, trace.id, safeName),
        classification,
        createdBy: user.id,
      })
      .returning();
    if (!row) throw new Error('failed to store attachment');
    res.status(201).json({ id: row.id, filename: row.filename, mime: row.mime, sizeBytes: row.sizeBytes, classification: row.classification });
  });

  return router;
}
