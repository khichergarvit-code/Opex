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
let testUserId: string | undefined;
const email = `auth-test-${Date.now()}@opex.local`;
const password = 'correct-horse-battery-staple';

beforeAll(async () => {
  db = await connectTestDb();
  if (!db) return;
  const passwordHash = await argon2.hash(password);
  const [row] = await db
    .insert(users)
    .values({ email, name: 'Auth Test', passwordHash, role: 'employee', clearance: 1 })
    .returning();
  testUserId = row?.id;
});

afterAll(async () => {
  if (db && testUserId) {
    await db.delete(users).where(eq(users.id, testUserId));
  }
});

describe('auth flow', () => {
  it('rejects an unknown user with a generic 401', async () => {
    if (!db) return; // see testDb.ts — needs a reachable Postgres
    const app = createApp(db, loadEnv());
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@opex.local', password: 'whatever' });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong password with a generic 401', async () => {
    if (!db) return;
    const app = createApp(db, loadEnv());
    const res = await request(app).post('/auth/login').send({ email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('logs in with correct credentials and sets a session cookie + csrf token', async () => {
    if (!db) return;
    const app = createApp(db, loadEnv());
    const res = await request(app).post('/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toBeTruthy();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('locks the account after 5 consecutive failures', async () => {
    if (!db) return;
    const app = createApp(db, loadEnv());
    for (let i = 0; i < 5; i++) {
      await request(app).post('/auth/login').send({ email, password: 'wrong-password' });
    }
    const res = await request(app).post('/auth/login').send({ email, password });
    expect(res.status).toBe(401); // locked out even with the correct password now
  });

  it('rejects a mutating request without a matching CSRF token once authenticated', async () => {
    if (!db) return;
    const app = createApp(db, loadEnv());
    const agent = request.agent(app);
    // separate, not-yet-locked user for this CSRF check
    const csrfEmail = `csrf-test-${Date.now()}@opex.local`;
    const csrfPassword = 'another-strong-password';
    const passwordHash = await argon2.hash(csrfPassword);
    const [csrfUser] = await db
      .insert(users)
      .values({ email: csrfEmail, name: 'CSRF Test', passwordHash, role: 'employee', clearance: 1 })
      .returning();

    await agent.post('/auth/login').send({ email: csrfEmail, password: csrfPassword });
    const res = await agent.post('/conversations').send({ projectId: crypto.randomUUID() });
    expect(res.status).toBe(403);

    if (csrfUser) await db.delete(users).where(eq(users.id, csrfUser.id));
  });
});
