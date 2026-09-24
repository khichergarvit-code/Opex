import { readFile } from 'node:fs/promises';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { Router, type Response } from 'express';
import type { CitationEvent, ProgressEvent, SseEvent } from '@opex/shared';
import { createConversationRequestSchema, postMessageRequestSchema } from '@opex/shared';
import type { Db } from '../db/client.js';
import { conversations, messages, projectMembers, projects, traces } from '../db/schema/index.js';
import type { Env } from '../env.js';
import { getWorkingMemory, type WorkingMemoryTurn } from '../memory/working.js';
import { buildMemoryBlock } from '../memory/longterm.js';
import { renderProjectNotesBlock } from '../memory/projectNotes.js';
import type { ModelGateway, SpanWriter } from '../models/gateway.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import { loadAgent, loadAgentSystemPrompt } from '../orchestrator/agents.js';
import { runExecutor } from '../orchestrator/executor.js';
import { route as routeMessage } from '../orchestrator/router.js';
import { verifyCitations, verifyCodeTask } from '../orchestrator/verifier.js';
import { answerWithVerification } from '../orchestrator/reviseLoop.js';
import { planTask } from '../orchestrator/planner.js';
import { runPlan } from '../orchestrator/scheduler.js';
import { listChatModels } from './models.js';
import { buildDocQaPrompt, extractCitedMarkers, projectHasReadyDocuments } from './docQa.js';

const CHAT_SYSTEM_PROMPT_PATH = new URL('../prompts/chat-system.md', import.meta.url);

function sendEvent(res: Response, event: SseEvent): void {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
}

/** Turns a raw model-call failure into something a non-technical user can act on. */
function describeModelError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'model call failed';
  if (/fetch failed|ECONNREFUSED|llama-server 5\d\d|Circuit open|not available/i.test(raw)) {
    return "The answer model isn't reachable right now (it may be restarting or out of memory). Try again in a minute, or switch to the Fast model.";
  }
  return raw;
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

  // The caller's own chat history — persisted in Postgres, so it survives
  // refreshes, navigation and restarts. Untitled chats fall back to their
  // first user message.
  router.get('/conversations', requireAuth(db), async (req, res) => {
    const user = req.user!;
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const rows = await db
      .select({
        id: conversations.id,
        projectId: conversations.projectId,
        title: sql<string | null>`coalesce(${conversations.title}, (select left(m.content, 80) from messages m where m.conversation_id = "conversations"."id" and m.role = 'user' order by m.created_at asc limit 1))`,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(projectId ? and(eq(conversations.userId, user.id), eq(conversations.projectId, projectId)) : eq(conversations.userId, user.id))
      .orderBy(desc(conversations.updatedAt))
      .limit(50);
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
    if (!conversation || conversation.userId !== user.id) {
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
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(asc(messages.createdAt));
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

    const chosenOption = parsed.data.modelId
      ? (await listChatModels(db, user)).find((m) => m.id === parsed.data.modelId)
      : undefined;
    if (parsed.data.modelId && !chosenOption) {
      res.status(400).json({ error: 'that model is not available to you' });
      return;
    }
    const chosenModelId = chosenOption?.id;
    // The small "Fast" model is only good enough for plain chat; answering
    // from documents needs the general model, so doc_qa overrides the pick.
    const docQaModelId = chosenOption && chosenOption.role !== 'general' ? undefined : chosenModelId;
    const docQaOverridden = Boolean(chosenModelId) && docQaModelId === undefined;

    const [trace] = await db.insert(traces).values({ userId: user.id, conversationId: conversation.id }).returning();
    if (!trace) throw new Error('failed to open trace');

    await db.insert(messages).values({
      conversationId: conversation.id,
      role: 'user',
      content: parsed.data.content,
      traceId: trace.id,
    });
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversation.id));

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    // Pressing Stop (or closing the tab) aborts the model call itself, so
    // CPU isn't burnt finishing an answer nobody is reading.
    const abort = new AbortController();
    let clientGone = false;
    res.on('close', () => {
      if (!res.writableFinished) {
        clientGone = true;
        abort.abort();
      }
    });
    const progress = (phase: ProgressEvent['data']['phase'], label: string) =>
      sendEvent(res, { type: 'progress', data: { phase, label } });
    progress('routing', 'Understanding your question…');

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(asc(messages.createdAt));
    // The just-inserted user row is last; prior turns exclude it since each
    // path below rebuilds the latest turn itself (doc_qa attaches chunks,
    // the executor path attaches nothing extra).
    const priorHistory = history
      .slice(0, -1)
      .filter((m) => !m.content.startsWith('⚠️ '))
      .map((m) => ({ role: m.role, content: m.content }));

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

    // B2 long-term memory: injected as labeled blocks in the user turn
    // (never the system prompt — invariant #5), regardless of which agent
    // handles the message. Project notes are always included; semantic/
    // episodic only when the router asked for them.
    const [project] = await db.select().from(projects).where(eq(projects.id, conversation.projectId)).limit(1);
    const { block: longTermMemoryBlock, injected: injectedMemories } = await buildMemoryBlock(
      { db, gateway, spanWriter, user, traceId: trace.id },
      { workspaceId: conversation.workspaceId, projectId: conversation.projectId, query: parsed.data.content, needsMemory: routeDecision.needs.memory },
    );
    const projectNotesBlock = project ? renderProjectNotesBlock(project.notesMd) : null;
    for (const m of injectedMemories) {
      sendEvent(res, { type: 'memory_used', data: { id: m.id, kind: m.type, score: m.score } });
    }
    if (projectNotesBlock) {
      sendEvent(res, { type: 'memory_used', data: { id: conversation.projectId, kind: 'project' } });
    }
    const memoryPrefix = [projectNotesBlock, longTermMemoryBlock].filter(Boolean).join('\n\n');
    const userContent = memoryPrefix ? `${memoryPrefix}\n\n${parsed.data.content}` : parsed.data.content;

    let assistantContent = '';
    let traceStatus: 'ok' | 'error' = 'ok';
    let failureMessage = '';
    let citations: Array<{ marker: number; documentId: string; filename: string; page: number; bbox: unknown }> = [];
    // B4: a paused tool call already set traces.status='awaiting_approval'
    // and left no assistant message to insert — skip the normal
    // finalization block entirely rather than overwrite that status.
    let pausedForApproval = false;

    if (routeDecision.complexity === 'multi_step') {
      try {
        progress('planning', 'Planning the steps…');
        const plan = await planTask({ gateway, user, traceId: trace.id, signal: abort.signal }, parsed.data.content);
        sendEvent(res, {
          type: 'plan',
          data: { steps: plan.steps.map((s) => ({ id: s.id, agent: s.agent, goal: s.goal, inputsFrom: s.inputsFrom })) },
        });
        assistantContent = await runPlan(
          {
            db,
            gateway,
            spanWriter,
            sandboxRunnerUrl: env.SANDBOX_RUNNER_URL,
            sandboxSharedSecret: env.SANDBOX_SHARED_SECRET,
            dataDir: env.DATA_DIR,
            user,
            traceId: trace.id,
            conversationId: conversation.id,
            workspaceId: conversation.workspaceId,
            projectId: conversation.projectId,
            taskClassification: 0,
            signal: abort.signal,
          },
          plan,
          userContent,
          {
            onSynthesisStart: () => progress('generating', 'Writing the final answer…'),
            onToken: (delta) => {
              assistantContent += delta;
              sendEvent(res, { type: 'token', data: { delta } });
            },
            onStepStart: (step) => sendEvent(res, { type: 'step_start', data: { stepId: step.id, agent: step.agent, goal: step.goal } }),
            onToolCall: (e) => {
              progress('tool', `Running ${e.toolName}…`);
              sendEvent(res, { type: 'tool_call', data: { toolName: e.toolName, callId: e.callId, args: e.args ?? {} } });
            },
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
        sendEvent(res, { type: 'replace', data: { text: assistantContent } });
      } catch (err) {
        traceStatus = 'error';
        failureMessage = describeModelError(err);
        sendEvent(res, { type: 'error', data: { message: failureMessage } });
      }
    } else if (routeDecision.agent === 'doc_qa') {
      progress('retrieving', 'Searching your documents…');
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
        // Memory blocks prepend to the augmented user turn itself, not
        // docQa's `question` param — that stays the bare question since
        // it also drives the retrieval query (buildDocQaPrompt uses it
        // for both search() and the displayed "Question: ..." text).
        const docQaMessages = [...docQa.messages];
        const lastTurn = docQaMessages[docQaMessages.length - 1];
        if (memoryPrefix && lastTurn) {
          docQaMessages[docQaMessages.length - 1] = { ...lastTurn, content: `${memoryPrefix}\n\n${lastTurn.content}` };
        }
        try {
          const validMarkers = new Set(docQa.citationMap.map((c) => c.marker));
          // Each draft streams live; it is only accepted once groundedness
          // checking passes on the complete text. A revision clears the
          // draft on screen (`replace` with '') and streams the new one.
          const verification = await answerWithVerification(
            { gateway, user, traceId: trace.id },
            docQa.systemPrompt,
            docQaMessages,
            docQa.citedChunks,
            validMarkers,
            {
              modelId: docQaModelId,
              signal: abort.signal,
              onAttemptStart: (attempt) => {
                assistantContent = '';
                if (attempt === 0) {
                  progress(
                    'generating',
                    docQaOverridden ? 'Writing the answer (document questions use the Quality model)…' : 'Writing the answer…',
                  );
                } else {
                  sendEvent(res, { type: 'replace', data: { text: '' } });
                  progress('revising', `Revising unsupported claims (attempt ${attempt + 1} of 3)…`);
                }
              },
              onDraftToken: (delta) => {
                assistantContent += delta;
                sendEvent(res, { type: 'token', data: { delta } });
              },
              onVerifying: () => progress('verifying', 'Checking the answer against your documents…'),
            },
          );
          assistantContent = verification.answer;
          // Guarantees the client ends on exactly the accepted text.
          sendEvent(res, { type: 'replace', data: { text: assistantContent } });

          const citedMarkers = new Set(extractCitedMarkers(assistantContent));
          citations = docQa.citationMap.filter((c) => citedMarkers.has(c.marker));
          for (const citation of citations) {
            sendEvent(res, { type: 'citation', data: citation as CitationEvent['data'] });
          }
          const legacyCheck = verifyCitations(assistantContent, validMarkers);
          sendEvent(res, {
            type: 'verify',
            data: {
              ok: verification.confidence === 'high',
              uncitedClaims: legacyCheck.uncitedClaims,
              confidence: verification.confidence,
              revisions: verification.revisions,
            },
          });
        } catch (err) {
          traceStatus = 'error';
          failureMessage = describeModelError(err);
          sendEvent(res, { type: 'error', data: { message: failureMessage } });
        }
      }
    } else if (routeDecision.agent !== 'general') {
      // Agent-agnostic: vision/analysis/code/research, and any
      // admin-created custom agent (B5's POST /admin/agents) — all go
      // through the same executor loop, gated only by whether loadAgent
      // finds an enabled row for that name.
      const agentConfig = await loadAgent(db, routeDecision.agent);
      if (!agentConfig) {
        traceStatus = 'error';
        sendEvent(res, { type: 'error', data: { message: `agent "${routeDecision.agent}" is not configured` } });
      } else {
        try {
          const systemPrompt = await loadAgentSystemPrompt(agentConfig);
          const observedToolResults: Array<{ ok: boolean; artifactIds: string[] }> = [];
          progress('generating', 'Working on it…');
          const executorOutcome = await runExecutor(
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
              messages: [...memoryTurns, { role: 'user', content: userContent }],
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
              signal: abort.signal,
              onToken: (delta) => {
                assistantContent += delta;
                sendEvent(res, { type: 'token', data: { delta } });
              },
              onDraftReset: () => {
                assistantContent = '';
                sendEvent(res, { type: 'replace', data: { text: '' } });
              },
              onToolCall: (e) => {
                progress('tool', `Running ${e.toolName}…`);
                sendEvent(res, { type: 'tool_call', data: { toolName: e.toolName, callId: e.callId, args: e.args ?? {} } });
              },
              onToolResult: (e) => {
                observedToolResults.push({ ok: e.result?.ok ?? false, artifactIds: e.result?.artifactIds ?? [] });
                sendEvent(res, {
                  type: 'tool_result',
                  data: {
                    callId: e.callId,
                    status: e.result?.ok ? 'ok' : 'error',
                    summary: e.result?.summary ?? '',
                    artifactIds: e.result?.artifactIds ?? [],
                  },
                });
              },
            },
          );
          if (executorOutcome.status === 'approval_required') {
            pausedForApproval = true;
            sendEvent(res, {
              type: 'approval_required',
              data: {
                approvalId: executorOutcome.approvalId,
                toolName: executorOutcome.toolName,
                args: executorOutcome.args,
                reason: executorOutcome.reason,
              },
            });
          } else {
            assistantContent = executorOutcome.answer;
            sendEvent(res, { type: 'replace', data: { text: assistantContent } });
            // B3b: a small, detect-only check (no retry loop) — did the
            // tool calls this answer relies on actually succeed.
            const codeCheck = verifyCodeTask(observedToolResults);
            sendEvent(res, {
              type: 'verify',
              data: { ok: codeCheck.ok, uncitedClaims: 0, confidence: codeCheck.confidence, revisions: 0 },
            });
          }
        } catch (err) {
          traceStatus = 'error';
          failureMessage = describeModelError(err);
          sendEvent(res, { type: 'error', data: { message: failureMessage } });
        }
      }
    } else {
      const systemPrompt = await readFile(CHAT_SYSTEM_PROMPT_PATH, 'utf8');
      try {
        progress('generating', 'Writing the answer…');
        for await (const delta of gateway.chatStream({
          role: 'general',
          modelId: chosenModelId,
          signal: abort.signal,
          messages: [{ role: 'system', content: systemPrompt }, ...memoryTurns, { role: 'user', content: userContent }],
          user,
          traceId: trace.id,
        })) {
          assistantContent += delta;
          sendEvent(res, { type: 'token', data: { delta } });
        }
      } catch (err) {
        traceStatus = 'error';
        failureMessage = describeModelError(err);
        sendEvent(res, { type: 'error', data: { message: failureMessage } });
      }
    }

    if (!pausedForApproval) {
      let assistantMessageId = '';
      if (traceStatus === 'ok' || clientGone || failureMessage) {
        // A stopped answer is still saved (with what was written so far) so
        // history never ends on an unanswered turn.
        const storedContent = clientGone
          ? assistantContent.trim()
            ? `${assistantContent}\n\n(stopped)`
            : '(stopped before an answer was written)'
          : traceStatus === 'error'
            ? `⚠️ ${failureMessage}`
            : assistantContent;
        const [assistantRow] = await db
          .insert(messages)
          .values({
            conversationId: conversation.id,
            role: 'assistant',
            content: storedContent,
            traceId: trace.id,
            citations,
          })
          .returning();
        assistantMessageId = assistantRow?.id ?? '';
        await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
      }

      await db
        .update(traces)
        .set({ status: clientGone ? 'error' : traceStatus, endedAt: new Date() })
        .where(eq(traces.id, trace.id));

      if (traceStatus === 'ok' && !clientGone) {
        sendEvent(res, { type: 'done', data: { messageId: assistantMessageId, traceId: trace.id } });
      }
    }
    res.end();
  });

  return router;
}
