import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { projectMembers, traces } from '../db/schema/index.js';
import type { Env } from '../env.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import { projectWorkspaceId } from '../policy/scope.js';
import type { SpanWriter } from '../models/gateway.js';
import type { AuditWriter } from '../audit/writeAudit.js';
import { callSandbox } from '../orchestrator/tools/sandboxClient.js';

const MAX_CODE_CHARS = 20_000;
const runRequestSchema = z.object({ code: z.string().min(1).max(MAX_CODE_CHARS) });

async function isProjectMember(db: Db, userId: string, projectId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.projectId, projectId)))
    .limit(1);
  return rows.length > 0;
}

/**
 * Manually running a code block the user is looking at, not something the agent decided to do — no
 * approval step (the click itself is the user's consent, and it's strictly less permissive than the
 * silent, no-approval auto-run a plain non-persist code_exec already gets inside the agent loop) and
 * never persist=true (that always needs the executor's own approval gate, which this bypasses on purpose
 * by not offering it at all here).
 */
export function createSandboxRunRouter(db: Db, spanWriter: SpanWriter, auditWriter: AuditWriter, env: Env): Router {
  const router = Router();

  router.post('/projects/:id/sandbox/run', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const projectId = req.params.id as string;
    const parsed = runRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    const member = await isProjectMember(db, user.id, projectId);
    const decision = can(user, 'sandbox:run', { projectId, isProjectMember: member, resourceWorkspaceId: await projectWorkspaceId(db, projectId) });
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }

    const [trace] = await db.insert(traces).values({ userId: user.id }).returning();
    if (!trace) throw new Error('failed to open trace');
    const started = Date.now();
    try {
      const result = await callSandbox(env.SANDBOX_RUNNER_URL, env.SANDBOX_SHARED_SECRET, {
        imageId: 'python-3.12-datasci',
        code: parsed.data.code,
        timeoutS: 15,
        persist: false,
        projectId,
      });
      await spanWriter.writeSpan({
        traceId: trace.id,
        kind: 'tool',
        name: 'tool.code_exec',
        latencyMs: Date.now() - started,
        status: result.exitCode === 0 ? 'ok' : 'error',
        attrs: { exitCode: result.exitCode, timedOut: result.timedOut, manual: true },
      });
      await auditWriter.writeAudit({
        actorId: user.id,
        action: 'sandbox.manual_run',
        resource: trace.id,
        details: { projectId, exitCode: result.exitCode, timedOut: result.timedOut },
      });
      res.json({
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        stdoutTruncated: result.stdoutTruncated,
        stderrTruncated: result.stderrTruncated,
        timedOut: result.timedOut,
      });
    } catch (err) {
      await spanWriter.writeSpan({
        traceId: trace.id,
        kind: 'tool',
        name: 'tool.code_exec',
        latencyMs: Date.now() - started,
        status: 'error',
        attrs: { error: err instanceof Error ? err.message : String(err), manual: true },
      });
      res.status(502).json({ error: 'the sandbox could not run this — try again' });
    }
  });

  return router;
}
