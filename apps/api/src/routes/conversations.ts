import { readFile } from 'node:fs/promises';
import { and, desc, eq } from 'drizzle-orm';
import { Router, type Response } from 'express';
import type { CitationEvent, SseEvent } from '@opex/shared';
import { createConversationRequestSchema, postMessageRequestSchema } from '@opex/shared';
import type { Db } from '../db/client.js';
import { conversations, messages, projectMembers, projects, traces } from '../db/schema/index.js';
import type { Env } from '../env.js';
import { getWorkingMemory, type WorkingMemoryTurn } from '../memory/working.js';
import type { ModelGateway, SpanWriter } from '../models/gateway.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import { loadAgent, loadAgentSystemPrompt } from '../orchestrator/agents.js';
import { runExecutor } from '../orchestrator/executor.js';
import { route as routeMessage } from '../orchestrator/router.js';
import { verifyCitations } from '../orchestrator/verifier.js';
import { buildDocQaPrompt, extractCitedMarkers, projectHasReadyDocuments } from './docQa.js';

const CHAT_SYSTEM_PROMPT_PATH = new URL('../prompts/chat-system.md', import.meta.url);

function sendEvent(res: Response, event: SseEvent): void {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
}

async function isProjectMember(db: Db, userId: string, projectId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.projectId, projectId)))
    .limit(1);
  return rows.length > 0;
}

/** Builds the [{role,content}] turns fed to a model from working memory's state. */
function toChatTurns(summary: string | null, recentTurns: WorkingMemoryTurn[]): WorkingMemoryTurn[] {
  if (!summary) return recentTurns;
  return [
    { role: 'system', content: `Summary of earlier turns in this conversation:\n${summary}` },
    ...recentTurns,
  ];
}

export function createConversationsRouter(
  db: Db,
  gateway: ModelGateway,
  spanWriter: SpanWriter,
  env: Pick<Env, 'DATA_DIR' | 'SANDBOX_RUNNER_URL' | 'SANDBOX_SHARED_SECRET'>,
): Router {
  const router = Router();

  router.post('/conversations', requireAuth(db), async (req, res) => {
    const parsed = createConversationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }
    const user = req.user!;
    const member = await isProjectMember(db, user.id, parsed.data.projectId);
    const decision = can(user, 'conversation:create', {
      projectId: parsed.data.projectId,
      isProjectMember: member,
    });
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, parsed.data.projectId))
      .limit(1);
    if (!project) {
      res.status(404).json({ error: 'project not found' });
      return;
    }

    const [row] = await db
      .insert(conversations)
      .values({
        workspaceId: project.workspaceId,
        projectId: parsed.data.projectId,
        userId: user.id,
        title: parsed.data.title,
      })
      .returning();
    res.status(201).json(row);
  });

  router.get('/conversations', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const rows = await db
      .select({
        id: conversations.id,
        projectId: conversations.projectId,
        title: conversations.title,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(eq(conversations.userId, user.id))
      .orderBy(desc(conversations.updatedAt))
      .limit(100);
    res.json(rows);
  });

  router.get('/conversations/:id', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, req.params.id as string))
      .limit(1);
    const conversation = rows[0];
    if (!conversation) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const member = await isProjectMember(db, user.id, conversation.projectId);
    const decision = can(user, 'conversation:read', {
      projectId: conversation.projectId,
      isProjectMember: member,
    });
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id));
    res.json({ conversation, messages: history });
  });

  router.post('/conversations/:id/messages', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const parsed = postMessageRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }

    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, req.params.id as string))
      .limit(1);
    const conversation = rows[0];
    if (!conversation) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const member = await isProjectMember(db, user.id, conversation.projectId);
    const decision = can(user, 'conversation:message', {
      projectId: conversation.projectId,
      isProjectMember: member,
    });
    if (!decision.allowed) {
      res.status(403).json({ error: decision.reason ?? 'forbidden' });
      return;
    }

    const [trace] = await db.insert(traces).values({ userId: user.id, conversationId: conversation.id }).returning();
    if (!trace) throw new Error('failed to open trace');

    await db.insert(messages).values({
      conversationId: conversation.id,
      role: 'user',
      content: parsed.data.content,
      traceId: trace.id,
    });

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id));
    // The just-inserted user row is last; prior turns exclude it since each
    // path below rebuilds the latest turn itself (doc_qa attaches chunks,
    // the executor path attaches nothing extra).
    const priorHistory = history.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));

    const hasReadyDocuments = await projectHasReadyDocuments(db, conversation.projectId);

    const routeDecision = await routeMessage({
      message: parsed.data.content,
      attachments: [],
      hasReadyDocuments,
      gateway,
      user,
      traceId: trace.id,
    });
    sendEvent(res, {
      type: 'route',
      data: {
        taskType: routeDecision.taskType,
        agent: routeDecision.agent,
        complexity: routeDecision.complexity,
        reason: routeDecision.reason,
      },
    });

    // Working memory: last-N raw turns + a rolling summary, folded once the
    // conversation exceeds budget (replaces A1/A2's "send full history").
    const memoryResult = await getWorkingMemory(
      { gateway, user, traceId: trace.id },
      priorHistory,
      conversation.workingSummary,
    );
    if (memoryResult.folded) {
      await db
        .update(conversations)
        .set({ workingSummary: memoryResult.summary })
        .where(eq(conversations.id, conversation.id));
    }
    const memoryTurns = toChatTurns(memoryResult.summary, memoryResult.recentTurns);

    let assistantContent = '';
    let traceStatus: 'ok' | 'error' = 'ok';
    let citations: Array<{ marker: number; documentId: string; filename: string; page: number; bbox: unknown }> = [];

    if (routeDecision.agent === 'doc_qa') {
      const docQa = await buildDocQaPrompt({
        db,
        gateway,
        spanWriter,
        user,
        traceId: trace.id,
        workspaceId: conversation.workspaceId,
        projectId: conversation.projectId,
        priorTurns: memoryTurns,
        question: parsed.data.content,
      });

      if (docQa.noSupportAnswer) {
        assistantContent = docQa.noSupportAnswer;
        sendEvent(res, { type: 'token', data: { delta: assistantContent } });
      } else {
        try {
          for await (const delta of gateway.chatStream({
            role: 'general',
            messages: [{ role: 'system', content: docQa.systemPrompt }, ...docQa.messages],
            user,
            traceId: trace.id,
          })) {
            assistantContent += delta;
            sendEvent(res, { type: 'token', data: { delta } });
          }
          const citedMarkers = new Set(extractCitedMarkers(assistantContent));
          citations = docQa.citationMap.filter((c) => citedMarkers.has(c.marker));
          for (const citation of citations) {
            sendEvent(res, { type: 'citation', data: citation as CitationEvent['data'] });
          }
          const verifyResult = verifyCitations(assistantContent, new Set(docQa.citationMap.map((c) => c.marker)));
          sendEvent(res, { type: 'verify', data: verifyResult });
        } catch (err) {
          traceStatus = 'error';
          sendEvent(res, {
            type: 'error',
            data: { message: err instanceof Error ? err.message : 'model call failed' },
          });
        }
      }
    } else if (routeDecision.agent === 'vision' || routeDecision.agent === 'analysis') {
      const agentConfig = await loadAgent(db, routeDecision.agent);
      if (!agentConfig) {
        traceStatus = 'error';
        sendEvent(res, { type: 'error', data: { message: `agent "${routeDecision.agent}" is not configured` } });
      } else {
        try {
          const systemPrompt = await loadAgentSystemPrompt(agentConfig);
          const executorResult = await runExecutor(
            {
              db,
              gateway,
              spanWriter,
              sandboxRunnerUrl: env.SANDBOX_RUNNER_URL,
              sandboxSharedSecret: env.SANDBOX_SHARED_SECRET,
              dataDir: env.DATA_DIR,
            },
            {
              agent: agentConfig,
              systemPrompt,
              messages: [...memoryTurns, { role: 'user', content: parsed.data.content }],
              user,
              traceId: trace.id,
              conversationId: conversation.id,
              workspaceId: conversation.workspaceId,
              projectId: conversation.projectId,
              // No per-task classification tracking yet (would need to know
              // which documents/data a tool call touches) — defaults to
              // Public, so invariant #10's gate is a no-op until that
              // exists. Documented as Debt.
              taskClassification: 0,
              onToolCall: (e) => sendEvent(res, { type: 'tool_call', data: { toolName: e.toolName, callId: e.callId, args: e.args ?? {} } }),
              onToolResult: (e) =>
                sendEvent(res, {
                  type: 'tool_result',
                  data: {
                    callId: e.callId,
                    status: e.result?.ok ? 'ok' : 'error',
                    summary: e.result?.summary ?? '',
                    artifactIds: e.result?.artifactIds ?? [],
                  },
                }),
            },
          );
          assistantContent = executorResult.answer;
          sendEvent(res, { type: 'token', data: { delta: assistantContent } });
        } catch (err) {
          traceStatus = 'error';
          sendEvent(res, {
            type: 'error',
            data: { message: err instanceof Error ? err.message : 'model call failed' },
          });
        }
      }
    } else {
      const systemPrompt = await readFile(CHAT_SYSTEM_PROMPT_PATH, 'utf8');
      try {
        for await (const delta of gateway.chatStream({
          role: 'general',
          messages: [{ role: 'system', content: systemPrompt }, ...memoryTurns, { role: 'user', content: parsed.data.content }],
          user,
          traceId: trace.id,
        })) {
          assistantContent += delta;
          sendEvent(res, { type: 'token', data: { delta } });
        }
      } catch (err) {
        traceStatus = 'error';
        sendEvent(res, {
          type: 'error',
          data: { message: err instanceof Error ? err.message : 'model call failed' },
        });
      }
    }

    let assistantMessageId = '';
    if (traceStatus === 'ok') {
      const [assistantRow] = await db
        .insert(messages)
        .values({
          conversationId: conversation.id,
          role: 'assistant',
          content: assistantContent,
          traceId: trace.id,
          citations,
        })
        .returning();
      assistantMessageId = assistantRow?.id ?? '';
    }

    await db
      .update(traces)
      .set({ status: traceStatus, endedAt: new Date() })
      .where(eq(traces.id, trace.id));

    if (traceStatus === 'ok') {
      sendEvent(res, { type: 'done', data: { messageId: assistantMessageId, traceId: trace.id } });
    }
    res.end();
  });

  return router;
}
