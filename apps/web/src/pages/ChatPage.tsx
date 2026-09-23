import { useEffect, useRef, useState } from 'react';
import type { ApprovalRequiredEvent, Bbox, Citation, MeResponse, Project, SseEvent } from '@opex/shared';
import {
  createConversation,
  decideApproval,
  fetchConversation,
  fetchConversations,
  fetchProjects,
  submitFeedback,
  type ConversationSummary,
} from '../lib/api';
import { navigate } from '../lib/router';
import { streamMessage } from '../lib/sse';
import { AppShell } from '../components/AppShell';
import { Composer } from '../components/Composer';
import { MessageList, type DisplayMessage } from '../components/MessageList';
import { AgentTimeline } from '../components/AgentTimeline';
import { ArtifactsPanel, type DisplayArtifact } from '../components/ArtifactsPanel';
import { ApprovalPrompt } from '../components/ApprovalPrompt';
import { Card } from '../components/ui/Card';

const STATUS_LABELS: Record<string, string> = {
  cold_start: 'Warming up the model',
  model_swap: 'Switching models',
};

function humanizeStatus(state: string): string {
  return STATUS_LABELS[state] ?? state;
}

export function ChatPage({
  user,
  conversationId,
  isAdmin,
  onLoggedOut,
  onActiveProjectChange,
  onOpenDocuments,
  onOpenCitation,
}: {
  user: MeResponse;
  /** From the URL (#/chat/:id) — chats live in Postgres, so any of them can be reopened. */
  conversationId?: string;
  isAdmin: boolean;
  onLoggedOut: () => void;
  onActiveProjectChange: (project: Project) => void;
  onOpenDocuments: () => void;
  onOpenCitation: (documentId: string, page: number, bbox: Bbox) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<SseEvent[]>([]);
  const [artifacts, setArtifacts] = useState<DisplayArtifact[]>([]);
  const [showTimeline, setShowTimeline] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequiredEvent['data'] | null>(null);
  const [decidingApproval, setDecidingApproval] = useState(false);
  const [lastRoutedAgent, setLastRoutedAgent] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const assistantIdRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const skipLoadForRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchProjects().then((rows) => {
      setProjects(rows);
      setProjectId((current) => current || rows[0]?.id || '');
    });
    return () => {
      if (pollRef.current !== null) clearInterval(pollRef.current);
      if (elapsedTimerRef.current !== null) clearInterval(elapsedTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const project = projects.find((p) => p.id === projectId);
    if (project) onActiveProjectChange(project);
  }, [projectId, projects]);

  function refreshHistory() {
    if (!projectId) return;
    fetchConversations(projectId)
      .then(setHistory)
      .catch(() => {});
  }

  useEffect(refreshHistory, [projectId]);

  function resetChatState() {
    abortRef.current?.abort();
    if (pollRef.current !== null) clearInterval(pollRef.current);
    setMessages([]);
    setTimelineEvents([]);
    setArtifacts([]);
    setLastRoutedAgent(null);
    setPendingApproval(null);
    setStatus(null);
    setStreaming(false);
  }

  function startNewChat() {
    resetChatState();
    setShowHistory(false);
    navigate({ name: 'chat' });
  }

  // Load a stored chat from Postgres whenever the URL's conversation id
  // changes (reopen from history, refresh, back/forward). A chat created by
  // the first send is skipped — its messages are already on screen.
  useEffect(() => {
    const skip = skipLoadForRef.current;
    if (skip !== conversationId) skipLoadForRef.current = null;
    if (!conversationId) {
      if (!skip) resetChatState();
      return;
    }
    if (skip === conversationId) return;
    let cancelled = false;
    resetChatState();

    const load = (): Promise<boolean> =>
      fetchConversation(conversationId)
        .then(({ conversation, messages: stored }) => {
          if (cancelled) return true;
          setProjectId(conversation.projectId);
          const visible = stored.filter((m) => m.role !== 'system');
          setMessages(visible.map((m) => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content, citations: m.citations ?? [] })));
          const last = visible[visible.length - 1];
          return !last || last.role === 'assistant';
        })
        .catch(() => {
          if (!cancelled) setStatus('could not load this chat');
          return true;
        });

    load().then((settled) => {
      if (settled || cancelled) return;
      // The server keeps generating after the browser leaves, then saves the
      // answer — poll until it lands.
      setStatus('OpeX is still working on your last message…');
      let tries = 0;
      pollRef.current = setInterval(() => {
        tries += 1;
        load().then((done) => {
          if (done || tries > 100) {
            if (pollRef.current !== null) clearInterval(pollRef.current);
            setStatus(null);
            refreshHistory();
          }
        });
      }, 3000);
    });
    return () => {
      cancelled = true;
      if (pollRef.current !== null) clearInterval(pollRef.current);
    };
  }, [conversationId]);

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const conv = await createConversation(projectId);
    skipLoadForRef.current = conv.id;
    navigate({ name: 'chat', conversationId: conv.id }, { replace: true });
    return conv.id;
  }

  function stopElapsedTimer() {
    if (elapsedTimerRef.current !== null) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }

  function stopGenerating() {
    abortRef.current?.abort();
  }

  async function handleSend(content: string) {
    if (!projectId) return;
    const convId = await ensureConversation();
    const userMsgId = crypto.randomUUID();
    assistantIdRef.current = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content },
      { id: assistantIdRef.current, role: 'assistant', content: '', citations: [] },
    ]);
    setStreaming(true);
    setStatus(null);
    setTimelineEvents([]);
    setPendingApproval(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = Date.now();
    setElapsedMs(0);
    stopElapsedTimer();
    elapsedTimerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAt), 250);

    await streamMessage(
      convId,
      content,
      {
        onEvent: (event) => {
          setTimelineEvents((prev) => [...prev, event]);
          if (event.type === 'route') {
            setLastRoutedAgent(event.data.agent);
          }
          if (event.type === 'tool_result') {
            const newArtifacts = event.data.artifactIds.map((id) => ({ id, toolName: 'tool' }));
            if (newArtifacts.length > 0) setArtifacts((prev) => [...prev, ...newArtifacts]);
          }
          if (event.type === 'verify') {
            // Real data from the groundedness verifier — never fabricated.
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantIdRef.current && event.data.confidence
                  ? { ...m, confidence: event.data.confidence, revisions: event.data.revisions }
                  : m,
              ),
            );
          }
          if (event.type === 'approval_required') {
            // The SSE stream ends right after this (conversations.ts skips
            // the normal done/error finalization while paused) — stop
            // treating the composer as busy so the approval card can act.
            setPendingApproval(event.data);
            setStreaming(false);
            stopElapsedTimer();
          }
        },
        onToken: (delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantIdRef.current ? { ...m, content: m.content + delta } : m,
            ),
          );
        },
        onStatus: (state, model) => setStatus(`${humanizeStatus(state)}… (${model})`),
        onCitation: (citation: Citation) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantIdRef.current
                ? { ...m, citations: [...(m.citations ?? []), citation] }
                : m,
            ),
          );
        },
        onDone: (messageId) => {
          // The assistant message was rendered under a client-generated id
          // while streaming; swap it for the real server id now so feedback
          // (thumbs up/down) submits against a message that actually exists
          // in the messages table, not a 404.
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantIdRef.current ? { ...m, id: messageId } : m)),
          );
          setStreaming(false);
          setStatus(null);
          stopElapsedTimer();
          refreshHistory();
        },
        onError: (message) => {
          setStreaming(false);
          setStatus(`error: ${message}`);
          stopElapsedTimer();
        },
      },
      controller.signal,
    );
    // Aborted by the user clicking Stop — streamMessage resolves normally
    // (fetch-event-source's own abort path, not onError), so finalize here.
    if (controller.signal.aborted) {
      setStreaming(false);
      setStatus('stopped');
      stopElapsedTimer();
    }
    abortRef.current = null;
  }

  async function handleApprovalDecision(decision: 'approved' | 'denied') {
    if (!pendingApproval) return;
    setDecidingApproval(true);
    try {
      const result = await decideApproval(pendingApproval.approvalId, decision);
      if (result.status === 'ok') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantIdRef.current
              ? { ...m, content: result.answer ?? m.content, id: result.messageId ?? m.id }
              : m,
          ),
        );
      } else if (result.status === 'approval_required') {
        // A different tool call in the same batch also needs approval —
        // not modeled inline; the admin/requester decides it from the
        // Approvals page instead of a second nested card here.
        setStatus('another approval is now required — see the Approvals page');
      } else {
        setStatus('the resumed task failed — see admin traces for details');
      }
    } catch {
      setStatus('failed to submit the decision');
    } finally {
      setDecidingApproval(false);
      setPendingApproval(null);
    }
  }

  const greetingName = user.email.split('@')[0] ?? user.email;
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

  const suggestionTiles = [
    {
      title: 'Ask a question',
      description: 'Chat with OpeX about anything',
      onClick: () => handleSend('What can you help me with in this project?'),
    },
    {
      title: 'Analyze a document',
      description: 'Open the document library',
      onClick: onOpenDocuments,
    },
    {
      title: 'Find a spec with citations',
      description: 'Ask a question grounded in your documents',
      onClick: () => handleSend('What is the torque spec for the discharge flange bolts?'),
    },
    {
      title: 'Review agent activity',
      description: 'See the live Activity Run panel',
      onClick: () => setShowTimeline(true),
    },
  ];

  return (
    <AppShell
      user={user}
      activeKey="chat"
      isAdmin={isAdmin}
      onNewChat={startNewChat}
      onLoggedOut={onLoggedOut}
    >
      <div className="mx-auto flex h-full max-w-5xl flex-col gap-6 p-4 md:flex-row md:p-6">
        <div className="flex flex-1 flex-col">
          <div className="mb-4 flex items-center justify-between">
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                startNewChat();
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="relative">
              <button
                onClick={() => setShowHistory((v) => !v)}
                aria-expanded={showHistory}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                History
              </button>
              {showHistory && (
                <div className="absolute left-0 top-full z-20 mt-1 max-h-80 w-72 overflow-y-auto rounded-xl border border-gray-100 bg-white p-1 shadow-lg">
                  {history.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-gray-400">No saved chats yet.</p>
                  ) : (
                    history.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setShowHistory(false);
                          navigate({ name: 'chat', conversationId: c.id });
                        }}
                        className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 ${c.id === conversationId ? 'bg-accent-50 font-medium text-accent-700' : 'text-gray-700'}`}
                      >
                        {c.title || 'Untitled chat'}
                        <span className="block text-xs font-normal text-gray-400">{new Date(c.updatedAt).toLocaleString()}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowTimeline((v) => !v)}
              className="text-sm font-medium text-accent-600 hover:text-accent-700"
            >
              {showTimeline ? 'Hide' : 'Show'} activity
            </button>
          </div>

          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-6">
              <div className="text-center">
                <p className="text-2xl font-semibold text-gray-900">
                  Good {timeOfDay}, {greetingName} 👋
                </p>
                <p className="mt-1 text-gray-500">How can I help you today?</p>
              </div>
              <div className="w-full max-w-xl">
                <Composer disabled={!projectId} onSend={handleSend} />
                {!projectId && projects.length === 0 && (
                  <p className="mt-2 text-center text-xs text-gray-400">
                    You're not a member of any project yet — ask an admin to add you to one.
                  </p>
                )}
              </div>
              <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
                {suggestionTiles.map((tile) => (
                  <button
                    key={tile.title}
                    onClick={tile.onClick}
                    disabled={!projectId}
                    className="rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-card transition-colors hover:border-accent-200 disabled:opacity-50"
                  >
                    <p className="text-sm font-medium text-gray-900">{tile.title}</p>
                    <p className="mt-0.5 text-xs text-gray-400">{tile.description}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto">
                <MessageList
                  messages={messages}
                  onOpenCitation={(c) => onOpenCitation(c.documentId, c.page, c.bbox)}
                  onFeedback={(messageId, rating) => {
                    submitFeedback(messageId, rating).catch(() => {});
                  }}
                />
                {streaming && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                    <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-accent-500" />
                    Generating… {(elapsedMs / 1000).toFixed(1)}s
                    <button onClick={stopGenerating} className="font-medium text-accent-600 hover:text-accent-700">
                      Stop
                    </button>
                  </div>
                )}
                {status && <p className="mt-2 text-xs text-gray-400">{status}</p>}
                {pendingApproval && (
                  <ApprovalPrompt
                    event={pendingApproval}
                    deciding={decidingApproval}
                    onApprove={() => handleApprovalDecision('approved')}
                    onDeny={() => handleApprovalDecision('denied')}
                  />
                )}
              </div>
              <div className="mt-4">
                <Composer disabled={streaming || !projectId || Boolean(pendingApproval)} onSend={handleSend} />
              </div>
            </>
          )}
        </div>

        {showTimeline && (
          <div className="w-full shrink-0 overflow-y-auto md:w-80">
            <Card>
              <p className="mb-3 text-sm font-semibold text-gray-900">Activity Run</p>
              <AgentTimeline events={timelineEvents} streaming={streaming} />
            </Card>
            <Card className="mt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Current model</p>
              {lastRoutedAgent ? (
                <p className="text-sm text-gray-800">{lastRoutedAgent} agent</p>
              ) : (
                <p className="text-sm text-gray-400">No agent routed yet</p>
              )}
            </Card>
            <Card className="mt-4">
              <p className="mb-2 text-sm font-semibold text-gray-900">Artifacts</p>
              <ArtifactsPanel artifacts={artifacts} />
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
