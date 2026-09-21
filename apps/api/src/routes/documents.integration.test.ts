import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectTestDb } from '../db/testDb.js';
import { documents, jobs, projectMembers, projects, users, workspaces } from '../db/schema/index.js';
import { loadEnv } from '../env.js';
import type { Db } from '../db/client.js';

let db: Db | null;
let workspaceId: string;
let projectId: string;
let testUserId: string | undefined;
const email = `docs-test-${Date.now()}@opex.local`;
const password = 'correct-horse-battery-staple';

// A minimal, valid 1-page PDF — enough for file-type to sniff as application/pdf.
const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF',
  'utf8',
);

beforeAll(async () => {
  db = await connectTestDb();
  if (!db) return;
  const passwordHash = await argon2.hash(password);
  const [row] = await db
    .insert(users)
    .values({ email, name: 'Docs Test', passwordHash, role: 'employee', clearance: 2 })
    .returning();
  testUserId = row?.id;

  const [ws] = await db.insert(workspaces).values({ name: 'docs-test-ws' }).returning();
  workspaceId = ws!.id;
  const [proj] = await db
    .insert(projects)
    .values({ workspaceId, name: 'docs-test-project', defaultClassification: 1 })
    .returning();
  projectId = proj!.id;
  await db.insert(projectMembers).values({ projectId, userId: testUserId! });
});

afterAll(async () => {
  if (!db) return;
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  if (testUserId) await db.delete(users).where(eq(users.id, testUserId));
});

describe('document upload', () => {
  it('uploads a PDF, verifies magic bytes, dedupes by sha256, and enqueues an ingest job', async () => {
    if (!db) return;
    const app = createApp(db, loadEnv());
    const agent = request.agent(app);
    const loginRes = await agent.post('/auth/login').send({ email, password });
    expect(loginRes.status).toBe(200);
    const csrfToken = loginRes.body.csrfToken as string;

    const uploadRes = await agent
      .post(`/projects/${projectId}/documents`)
      .set('x-csrf-token', csrfToken)
      .attach('file', MINIMAL_PDF, { filename: 'test.pdf', contentType: 'application/pdf' });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.mime).toBe('application/pdf');
    expect(uploadRes.body.status).toBe('queued');
    expect(uploadRes.body.classification).toBe(1); // project's default

    const jobRows = await db
      .select()
      .from(jobs)
      .where(eq(jobs.kind, 'ingest_document'));
    const matching = jobRows.find(
      (j) => (j.payload as { documentId: string }).documentId === uploadRes.body.id,
    );
    expect(matching).toBeDefined();
    expect(matching?.status).toBe('pending');

    // Re-uploading the identical bytes dedupes instead of creating a new row.
    const dupeRes = await agent
      .post(`/projects/${projectId}/documents`)
      .set('x-csrf-token', csrfToken)
      .attach('file', MINIMAL_PDF, { filename: 'test-again.pdf', contentType: 'application/pdf' });
    expect(dupeRes.status).toBe(200);
    expect(dupeRes.body.id).toBe(uploadRes.body.id);

    const allDocs = await db.select().from(documents).where(eq(documents.projectId, projectId));
    expect(allDocs).toHaveLength(1);
  });

  it('rejects a file whose magic bytes do not match an allowed type', async () => {
    if (!db) return;
    const app = createApp(db, loadEnv());
    const agent = request.agent(app);
    const loginRes = await agent.post('/auth/login').send({ email, password });
    const csrfToken = loginRes.body.csrfToken as string;

    const res = await agent
      .post(`/projects/${projectId}/documents`)
      .set('x-csrf-token', csrfToken)
      .attach('file', Buffer.from('MZ\x90\x00fake windows executable'), {
        filename: 'evil.exe',
        contentType: 'application/pdf', // lying about the mime — magic bytes must win
      });

    expect(res.status).toBe(415);
  });
});
