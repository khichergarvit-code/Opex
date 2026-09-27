import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { connectTestDb } from '../db/testDb.js';
import { projectMembers, projects, users, workspaces } from '../db/schema/index.js';
import { loadEnv } from '../env.js';
import type { Db } from '../db/client.js';

// The real sandbox isn't reachable from a plain `pnpm test` run (it's on the internal `core`
// network) — mocked here, the same way a live sandbox run is verified separately (see the plan's
// live-check step) rather than in this fast unit-style test.
vi.mock('../orchestrator/tools/sandboxClient.js', () => ({
  callSandbox: vi.fn(async (_url: string, _secret: string, req: { code: string }) => ({
    exitCode: req.code.includes('raise') ? 1 : 0,
    stdout: req.code.includes('raise') ? '' : '4\n',
    stderr: req.code.includes('raise') ? 'Traceback...' : '',
    stdoutTruncated: false,
    stderrTruncated: false,
    timedOut: false,
    files: [],
  })),
}));

let db: Db | null;
let workspaceId: string;
let projectId: string;
let memberId: string | undefined;
let outsiderId: string | undefined;
const memberEmail = `sandbox-member-${Date.now()}@opex.local`;
const outsiderEmail = `sandbox-outsider-${Date.now()}@opex.local`;
const password = 'correct-horse-battery-staple';

beforeAll(async () => {
  db = await connectTestDb();
  if (!db) return;
  const passwordHash = await argon2.hash(password);
  const [ws] = await db.insert(workspaces).values({ name: `sandbox-run-test-${Date.now()}` }).returning();
  workspaceId = ws!.id;
  const [project] = await db.insert(projects).values({ workspaceId, name: 'Sandbox Test Project' }).returning();
  projectId = project!.id;

  const [member] = await db.insert(users).values({ email: memberEmail, name: 'Member', passwordHash, role: 'employee', clearance: 1, workspaceId }).returning();
  memberId = member!.id;
  await db.insert(projectMembers).values({ projectId, userId: memberId! });

  const [outsider] = await db.insert(users).values({ email: outsiderEmail, name: 'Outsider', passwordHash, role: 'employee', clearance: 1, workspaceId }).returning();
  outsiderId = outsider!.id;
});

afterAll(async () => {
  if (!db) return;
  if (memberId) await db.delete(users).where(eq(users.id, memberId));
  if (outsiderId) await db.delete(users).where(eq(users.id, outsiderId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
});

describe('POST /projects/:id/sandbox/run', () => {
  it('a project member gets real stdout back', async () => {
    if (!db) return;
    const { createApp } = await import('../app.js');
    const app = createApp(db, loadEnv());
    const agent = request.agent(app);
    const loginRes = await agent.post('/auth/login').send({ email: memberEmail, password });
    const csrf = loginRes.body.csrfToken as string;

    const res = await agent.post(`/projects/${projectId}/sandbox/run`).set('x-csrf-token', csrf).send({ code: 'print(2 + 2)' });
    expect(res.status).toBe(200);
    expect(res.body.exitCode).toBe(0);
    expect(res.body.stdout).toBe('4\n');
  });

  it('a nonzero exit code still comes back as a normal 200 (it is a real result, not a request failure)', async () => {
    if (!db) return;
    const { createApp } = await import('../app.js');
    const app = createApp(db, loadEnv());
    const agent = request.agent(app);
    const loginRes = await agent.post('/auth/login').send({ email: memberEmail, password });
    const csrf = loginRes.body.csrfToken as string;

    const res = await agent.post(`/projects/${projectId}/sandbox/run`).set('x-csrf-token', csrf).send({ code: 'raise ValueError("x")' });
    expect(res.status).toBe(200);
    expect(res.body.exitCode).toBe(1);
  });

  it('someone outside the project is refused', async () => {
    if (!db) return;
    const { createApp } = await import('../app.js');
    const app = createApp(db, loadEnv());
    const agent = request.agent(app);
    const loginRes = await agent.post('/auth/login').send({ email: outsiderEmail, password });
    const csrf = loginRes.body.csrfToken as string;

    const res = await agent.post(`/projects/${projectId}/sandbox/run`).set('x-csrf-token', csrf).send({ code: 'print(1)' });
    expect(res.status).toBe(403);
  });

  it('rejects an empty or oversized snippet', async () => {
    if (!db) return;
    const { createApp } = await import('../app.js');
    const app = createApp(db, loadEnv());
    const agent = request.agent(app);
    const loginRes = await agent.post('/auth/login').send({ email: memberEmail, password });
    const csrf = loginRes.body.csrfToken as string;

    const empty = await agent.post(`/projects/${projectId}/sandbox/run`).set('x-csrf-token', csrf).send({ code: '' });
    expect(empty.status).toBe(400);

    const oversized = await agent.post(`/projects/${projectId}/sandbox/run`).set('x-csrf-token', csrf).send({ code: 'x'.repeat(20_001) });
    expect(oversized.status).toBe(400);
  });
});
