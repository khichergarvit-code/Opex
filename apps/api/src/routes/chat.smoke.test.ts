import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectTestDb } from '../db/testDb.js';
import { projects, spans, traces } from '../db/schema/index.js';
import { loadEnv } from '../env.js';

/**
 * End-to-end smoke test for A1's core AC: streaming chat works with a local
 * model, and spans/token counts are written to the DB. Gated behind
 * RUN_LLM_SMOKE_TEST=1 because it needs `make up` (or host-native
 * llama-server) actually running — not part of the default `pnpm test` run.
 */
const gated = process.env.RUN_LLM_SMOKE_TEST === '1' ? describe : describe.skip;

gated('chat smoke test (RUN_LLM_SMOKE_TEST=1)', () => {
  it(
    'streams a chat response and records a span with token counts',
    async () => {
      const db = await connectTestDb();
      expect(db).not.toBeNull();
      if (!db) return;

      const app = createApp(db, loadEnv());
      const agent = request.agent(app);

      // Reuses a seeded user — run `pnpm seed` first.
      const loginRes = await agent
        .post('/auth/login')
        .send({ email: 'employee.internal@opex.local', password: 'opex-dev-password' });
      expect(loginRes.status).toBe(200);
      const csrfToken = loginRes.body.csrfToken as string;

      const [project] = await db.select().from(projects).limit(1);
      expect(project).toBeDefined();

      const convRes = await agent
        .post('/conversations')
        .set('x-csrf-token', csrfToken)
        .send({ projectId: project!.id });
      expect(convRes.status).toBe(201);
      const conversationId = convRes.body.id as string;

      const msgRes = await agent
        .post(`/conversations/${conversationId}/messages`)
        .set('x-csrf-token', csrfToken)
        .send({ content: 'Say hello in exactly three words.' });
      expect(msgRes.status).toBe(200);
      expect(msgRes.text).toContain('event: token');
      expect(msgRes.text).toContain('event: done');

      const traceRows = await db
        .select()
        .from(traces)
        .where(eq(traces.conversationId, conversationId));
      expect(traceRows.length).toBeGreaterThan(0);
      const trace = traceRows[traceRows.length - 1]!;
      expect(trace.status).toBe('ok');

      const spanRows = await db.select().from(spans).where(eq(spans.traceId, trace.id));
      expect(spanRows.length).toBeGreaterThan(0);
      expect(spanRows[0]!.status).toBe('ok');
      expect(spanRows[0]!.latencyMs).toBeGreaterThan(0);
    },
    60_000,
  );
});
