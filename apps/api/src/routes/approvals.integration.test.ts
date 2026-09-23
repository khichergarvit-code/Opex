import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectTestDb } from '../db/testDb.js';
import { approvals, conversations, projectMembers, projects, traces, users, workspaces } from '../db/schema/index.js';
import { loadEnv } from '../env.js';
import type { Db } from '../db/client.js';
import type { ExecutorCheckpoint } from '../orchestrator/executor.js';
import type { AgentConfig } from '../orchestrator/types.js';

let db: Db | null;
let workspaceId: string;
let projectId: string;
let conversationId: string;
let requesterId: string | undefined;
let adminId: string | undefined;

const requesterEmail = `approvals-test-requester-${Date.now()}@opex.local`;
const adminEmail = `approvals-test-admin-${Date.now()}@opex.local`;
const password = 'correct-horse-battery-staple';

function agentConfig(): AgentConfig {
  return {
    id: 'a1',
    name: 'analysis',
    version: 1,
    description: '',
    systemPromptTemplate: 'x',
    modelRole: 'general',
    toolAllowlist: ['code_exec'],
    maxIterations: 8,
    requiresApprovalTools: ['code_exec'],
    enabled: true,
    allowedGroups: [],
  };
}

async function insertApproval(reqUserId: string, traceId: string): Promise<string> {
  const checkpoint: ExecutorCheckpoint = {
    agent: agentConfig(),
    messages: [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'run this' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call1', type: 'function', function: { name: 'code_exec', arguments: '{"code":"print(1)"}' } }],
      },
    ],
    iteration: 0,
    toolCallCount: 1,
    pendingCall: { id: 'call1', name: 'code_exec', arguments: '{"code":"print(1)"}' },
    remainingCalls: [],
    user: { id: reqUserId, email: requesterEmail, role: 'employee', clearance: 1, status: 'active' },
    traceId,
    conversationId,
    workspaceId,
    projectId,
    taskClassification: 0,
  };
  const [row] = await db!
    .insert(approvals)
    .values({
      traceId,
      conversationId,
      requesterId: reqUserId,
      agentName: 'analysis',
      toolName: 'code_exec',
      args: { code: 'print(1)' },
      reason: 'the analysis agent\'s "code_exec" tool always requires approval',
      executorCheckpoint: checkpoint,
    })
    .returning({ id: approvals.id });
  return row!.id;
}

beforeAll(async () => {
  db = await connectTestDb();
  if (!db) return;
  const passwordHash = await argon2.hash(password);
  const [requesterRow] = await db
    .insert(users)
    .values({ email: requesterEmail, name: 'Approvals Requester', passwordHash, role: 'employee', clearance: 1 })
    .returning();
  requesterId = requesterRow?.id;
  const [adminRow] = await db
    .insert(users)
    .values({ email: adminEmail, name: 'Approvals Admin', passwordHash, role: 'super_admin', clearance: 3 })
    .returning();
  adminId = adminRow?.id;

  const [ws] = await db.insert(workspaces).values({ name: 'approvals-test-ws' }).returning();
  workspaceId = ws!.id;
  const [proj] = await db.insert(projects).values({ workspaceId, name: 'approvals-test-project', defaultClassification: 1 }).returning();
  projectId = proj!.id;
  await db.insert(projectMembers).values({ projectId, userId: requesterId! });
  const [conv] = await db.insert(conversations).values({ workspaceId, projectId, userId: requesterId! }).returning();
  conversationId = conv!.id;
});

afterAll(async () => {
  if (!db) return;
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  if (requesterId) await db.delete(users).where(eq(users.id, requesterId));
  if (adminId) await db.delete(users).where(eq(users.id, adminId));
});

describe('approvals route', () => {
  it('lets the requester see and approve their own pending approval, running the tool and finishing the trace', async () => {
    if (!db || !requesterId) return;
    const [trace] = await db.insert(traces).values({ userId: requesterId, conversationId }).returning();
    const approvalId = await insertApproval(requesterId, trace!.id);

    // Simulates "survives a restart": a completely fresh app/process, no
    // in-memory state — everything needed comes back out of Postgres.
    const app = createApp(db, loadEnv());
    const agent = request.agent(app);
    const loginRes = await agent.post('/auth/login').send({ email: requesterEmail, password });
    const csrf = loginRes.body.csrfToken as string;

    const pendingRes = await agent.get('/approvals/pending').set('x-csrf-token', csrf);
    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.some((r: { id: string }) => r.id === approvalId)).toBe(true);

    const decideRes = await agent.post(`/approvals/${approvalId}/decide`).set('x-csrf-token', csrf).send({ decision: 'approved' });
    expect(decideRes.status).toBe(200);
    expect(decideRes.body.status).toBe('ok');

    const [approvalRow] = await db.select().from(approvals).where(eq(approvals.id, approvalId)).limit(1);
    expect(approvalRow?.status).toBe('approved');
    expect(approvalRow?.decidedBy).toBe(requesterId);

    const [traceRow] = await db.select().from(traces).where(eq(traces.id, trace!.id)).limit(1);
    expect(traceRow?.status).toBe('ok');
  });

  it('lets an admin deny someone else\'s pending approval without executing the tool', async () => {
    if (!db || !requesterId || !adminId) return;
    const [trace] = await db.insert(traces).values({ userId: requesterId, conversationId }).returning();
    const approvalId = await insertApproval(requesterId, trace!.id);

    const app = createApp(db, loadEnv());
    const agent = request.agent(app);
    const loginRes = await agent.post('/auth/login').send({ email: adminEmail, password });
    const csrf = loginRes.body.csrfToken as string;

    const decideRes = await agent.post(`/approvals/${approvalId}/decide`).set('x-csrf-token', csrf).send({ decision: 'denied' });
    expect(decideRes.status).toBe(200);
    expect(decideRes.body.status).toBe('ok');

    const [approvalRow] = await db.select().from(approvals).where(eq(approvals.id, approvalId)).limit(1);
    expect(approvalRow?.status).toBe('denied');
    expect(approvalRow?.decidedBy).toBe(adminId);
  });

  it('refuses a decision from a user who is neither the requester nor an admin', async () => {
    if (!db || !requesterId) return;
    const [trace] = await db.insert(traces).values({ userId: requesterId, conversationId }).returning();
    const approvalId = await insertApproval(requesterId, trace!.id);

    const passwordHash = await argon2.hash(password);
    const outsiderEmail = `approvals-test-outsider-${Date.now()}@opex.local`;
    const [outsider] = await db
      .insert(users)
      .values({ email: outsiderEmail, name: 'Outsider', passwordHash, role: 'employee', clearance: 1 })
      .returning();

    const app = createApp(db, loadEnv());
    const agent = request.agent(app);
    const loginRes = await agent.post('/auth/login').send({ email: outsiderEmail, password });
    const csrf = loginRes.body.csrfToken as string;

    const decideRes = await agent.post(`/approvals/${approvalId}/decide`).set('x-csrf-token', csrf).send({ decision: 'approved' });
    expect(decideRes.status).toBe(403);

    await db.delete(users).where(eq(users.id, outsider!.id));
  });

  it('refuses to decide an approval a second time', async () => {
    if (!db || !requesterId) return;
    const [trace] = await db.insert(traces).values({ userId: requesterId, conversationId }).returning();
    const approvalId = await insertApproval(requesterId, trace!.id);

    const app = createApp(db, loadEnv());
    const agent = request.agent(app);
    const loginRes = await agent.post('/auth/login').send({ email: requesterEmail, password });
    const csrf = loginRes.body.csrfToken as string;

    const first = await agent.post(`/approvals/${approvalId}/decide`).set('x-csrf-token', csrf).send({ decision: 'denied' });
    expect(first.status).toBe(200);

    const second = await agent.post(`/approvals/${approvalId}/decide`).set('x-csrf-token', csrf).send({ decision: 'approved' });
    expect(second.status).toBe(409);
  });
});
