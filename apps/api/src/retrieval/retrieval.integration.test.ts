import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client.js';
import { connectTestDb } from '../db/testDb.js';
import { chunks, documents, projects, users, workspaces } from '../db/schema/index.js';
import { ftsSearch } from './ftsSearch.js';
import { vectorSearch } from './vectorSearch.js';
import type { SearchParams } from './types.js';

let db: Db | null;
let workspaceId: string;
let projectId: string;
let documentId: string;
let publicChunkId: string;
let restrictedChunkId: string;
let groupGatedChunkId: string;
const RESTRICTED_GROUP_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_GROUP_ID = '22222222-2222-2222-2222-222222222222';

function fakeEmbedding(seed: number): string {
  // Deterministic 1024-dim vector so vector search has something to rank on.
  const v = Array.from({ length: 1024 }, (_, i) => Math.sin(seed + i) * 0.01);
  return `[${v.join(',')}]`;
}

beforeAll(async () => {
  db = await connectTestDb();
  if (!db) return;

  const [ws] = await db
    .insert(workspaces)
    .values({ name: 'retrieval-test-workspace' })
    .returning();
  workspaceId = ws!.id;
  const [proj] = await db
    .insert(projects)
    .values({ workspaceId, name: 'retrieval-test-project', defaultClassification: 0 })
    .returning();
  projectId = proj!.id;
  const [anyUser] = await db.select({ id: users.id }).from(users).limit(1);
  if (!anyUser) throw new Error('no seeded user found — run pnpm seed first');
  const [doc] = await db
    .insert(documents)
    .values({
      workspaceId,
      projectId,
      sha256: 'deadbeef',
      filename: 'test.pdf',
      mime: 'application/pdf',
      sizeBytes: 100,
      classification: 3,
      uploadedBy: anyUser.id,
    })
    .returning();
  documentId = doc!.id;

  const rows = await db
    .insert(chunks)
    .values([
      {
        documentId,
        workspaceId,
        projectId,
        classification: 0,
        kind: 'text',
        page: 1,
        bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
        text: 'public torque spec bolt A fifty newton meters',
        chunkIndex: 0,
      },
      {
        documentId,
        workspaceId,
        projectId,
        classification: 3,
        kind: 'text',
        page: 2,
        bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
        text: 'restricted codename torque spec bolt B',
        chunkIndex: 1,
      },
      {
        documentId,
        workspaceId,
        projectId,
        classification: 1,
        aclGroupIds: [RESTRICTED_GROUP_ID],
        kind: 'text',
        page: 3,
        bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
        text: 'group gated torque spec bolt C',
        chunkIndex: 2,
      },
    ])
    .returning({ id: chunks.id });
  publicChunkId = rows[0]!.id;
  restrictedChunkId = rows[1]!.id;
  groupGatedChunkId = rows[2]!.id;

  // Give each row a distinct embedding so vector ranking is deterministic.
  await db.execute(
    sql`UPDATE chunks SET embedding = ${fakeEmbedding(1)}::vector WHERE id = ${publicChunkId}`,
  );
  await db.execute(
    sql`UPDATE chunks SET embedding = ${fakeEmbedding(2)}::vector WHERE id = ${restrictedChunkId}`,
  );
  await db.execute(
    sql`UPDATE chunks SET embedding = ${fakeEmbedding(3)}::vector WHERE id = ${groupGatedChunkId}`,
  );
});

afterAll(async () => {
  if (!db) return;
  await db.delete(workspaces).where(sql`${workspaces.id} = ${workspaceId}`);
});

function paramsFor(overrides: Partial<SearchParams>): SearchParams {
  return {
    workspaceId,
    projectIds: [projectId],
    userId: '00000000-0000-0000-0000-000000000000',
    clearance: 0,
    groupIds: [],
    query: 'torque spec bolt',
    ...overrides,
  };
}

describe('retrieval ACL filtering (invariant #4)', () => {
  it('a Public-clearance user with no groups only sees the public chunk', async () => {
    if (!db) return;
    const ftsResults = await ftsSearch(db, paramsFor({ clearance: 0, groupIds: [] }), 10);
    const ids = ftsResults.map((c) => c.id);
    expect(ids).toContain(publicChunkId);
    expect(ids).not.toContain(restrictedChunkId);
    expect(ids).not.toContain(groupGatedChunkId);
  });

  it('a Restricted-clearance user sees the public and restricted chunks, but not the group-gated one without the group', async () => {
    if (!db) return;
    const ftsResults = await ftsSearch(db, paramsFor({ clearance: 3, groupIds: [] }), 10);
    const ids = ftsResults.map((c) => c.id);
    expect(ids).toContain(publicChunkId);
    expect(ids).toContain(restrictedChunkId);
    expect(ids).not.toContain(groupGatedChunkId);
  });

  it('a low-clearance user in the right group sees the group-gated chunk but not the restricted one', async () => {
    if (!db) return;
    const ftsResults = await ftsSearch(
      db,
      paramsFor({ clearance: 1, groupIds: [RESTRICTED_GROUP_ID] }),
      10,
    );
    const ids = ftsResults.map((c) => c.id);
    expect(ids).toContain(publicChunkId);
    expect(ids).toContain(groupGatedChunkId);
    expect(ids).not.toContain(restrictedChunkId);
  });

  it('membership in an unrelated group does not unlock a different group-gated chunk', async () => {
    if (!db) return;
    const ftsResults = await ftsSearch(
      db,
      paramsFor({ clearance: 1, groupIds: [OTHER_GROUP_ID] }),
      10,
    );
    const ids = ftsResults.map((c) => c.id);
    expect(ids).not.toContain(groupGatedChunkId);
  });

  it('vector search applies the identical ACL filter as fts search', async () => {
    if (!db) return;
    const results = await vectorSearch(db, paramsFor({ clearance: 0, groupIds: [] }), fakeEmbedding(1).slice(1, -1).split(',').map(Number), 10);
    const ids = results.map((c) => c.id);
    expect(ids).not.toContain(restrictedChunkId);
    expect(ids).not.toContain(groupGatedChunkId);
  });
});
