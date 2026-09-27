import argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectTestDb } from '../db/testDb.js';
import { projectMembers, projects, users, workspaces } from '../db/schema/index.js';
import { loadEnv } from '../env.js';
import type { Db } from '../db/client.js';

let db: Db | null;
let adminUserId: string | undefined;
const adminEmail = `admin-users-test-${Date.now()}@opex.local`;
const adminPassword = 'super-admin-test-password';

beforeAll(async () => {
  db = await connectTestDb();
  if (!db) return;
  const passwordHash = await argon2.hash(adminPassword);
  const [row] = await db
    .insert(users)
    .values({ email: adminEmail, name: 'Admin Users Test', passwordHash, role: 'super_admin', clearance: 3 })
    .returning();
  adminUserId = row?.id;
});

afterAll(async () => {
  if (db && adminUserId) {
    await db.delete(users).where(eq(users.id, adminUserId));
  }
});

describe('admin users route', () => {
  it('creates a user, disables it, and confirms the disabled user can no longer log in', async () => {
    if (!db) return; // see testDb.ts — needs a reachable Postgres

    const app = createApp(db, loadEnv());
    const agent = request.agent(app);
    const loginRes = await agent.post('/auth/login').send({ email: adminEmail, password: adminPassword });
    const csrf = loginRes.body.csrfToken as string;

    const newEmail = `created-${Date.now()}@opex.local`;
    const newPassword = 'a-brand-new-password';
    const createRes = await agent
      .post('/admin/users')
      .set('x-csrf-token', csrf)
      .send({ email: newEmail, name: 'Created User', password: newPassword, role: 'employee', clearance: 1 });
    expect(createRes.status).toBe(201);
    const createdId = createRes.body.id as string;
    expect(createdId).toBeTruthy();

    const loginBeforeDisable = await request(app).post('/auth/login').send({ email: newEmail, password: newPassword });
    expect(loginBeforeDisable.status).toBe(200);

    const disableRes = await agent.patch(`/admin/users/${createdId}/disable`).set('x-csrf-token', csrf);
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.status).toBe('disabled');

    const loginAfterDisable = await request(app).post('/auth/login').send({ email: newEmail, password: newPassword });
    expect(loginAfterDisable.status).toBe(401);

    await db.delete(users).where(eq(users.id, createdId));
  });

  it('creating an employee in a workspace with no projects auto-creates a Default Project and adds them to it', async () => {
    if (!db) return;
    const app = createApp(db, loadEnv());
    const agent = request.agent(app);
    const loginRes = await agent.post('/auth/login').send({ email: adminEmail, password: adminPassword });
    const csrf = loginRes.body.csrfToken as string;

    const [ws] = await db.insert(workspaces).values({ name: `empty-ws-${Date.now()}` }).returning();
    const email = `noproj-${Date.now()}@opex.local`;
    const createRes = await agent
      .post('/admin/users')
      .set('x-csrf-token', csrf)
      .send({ email, name: 'No Project Yet', password: 'a-brand-new-password', role: 'employee', clearance: 1, workspaceId: ws!.id });
    expect(createRes.status).toBe(201);
    expect(createRes.body.projectName).toBe('Default Project');

    const [project] = await db.select().from(projects).where(eq(projects.workspaceId, ws!.id));
    expect(project).toBeTruthy();
    const [membership] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.userId, createRes.body.id), eq(projectMembers.projectId, project!.id)));
    expect(membership).toBeTruthy();

    await db.delete(users).where(eq(users.id, createRes.body.id));
    await db.delete(workspaces).where(eq(workspaces.id, ws!.id));
  });

  it('creating an employee in a workspace with two projects requires picking one', async () => {
    if (!db) return;
    const app = createApp(db, loadEnv());
    const agent = request.agent(app);
    const loginRes = await agent.post('/auth/login').send({ email: adminEmail, password: adminPassword });
    const csrf = loginRes.body.csrfToken as string;

    const [ws] = await db.insert(workspaces).values({ name: `two-proj-ws-${Date.now()}` }).returning();
    const [p1] = await db.insert(projects).values({ workspaceId: ws!.id, name: 'Alpha' }).returning();
    const [p2] = await db.insert(projects).values({ workspaceId: ws!.id, name: 'Beta' }).returning();
    const email = `twoproj-${Date.now()}@opex.local`;

    const withoutChoice = await agent
      .post('/admin/users')
      .set('x-csrf-token', csrf)
      .send({ email, name: 'Needs A Project', password: 'a-brand-new-password', role: 'employee', clearance: 1, workspaceId: ws!.id });
    expect(withoutChoice.status).toBe(400);

    const withChoice = await agent
      .post('/admin/users')
      .set('x-csrf-token', csrf)
      .send({ email, name: 'Needs A Project', password: 'a-brand-new-password', role: 'employee', clearance: 1, workspaceId: ws!.id, projectId: p2!.id });
    expect(withChoice.status).toBe(201);
    expect(withChoice.body.projectName).toBe('Beta');

    const [membership] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.userId, withChoice.body.id), eq(projectMembers.projectId, p2!.id)));
    expect(membership).toBeTruthy();

    await db.delete(users).where(eq(users.id, withChoice.body.id));
    await db.delete(projects).where(eq(projects.id, p1!.id));
    await db.delete(projects).where(eq(projects.id, p2!.id));
    await db.delete(workspaces).where(eq(workspaces.id, ws!.id));
  });
});
