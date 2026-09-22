import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectTestDb } from '../db/testDb.js';
import { users } from '../db/schema/index.js';
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
});
