import { useEffect, useRef, useState } from 'react';
import type { ApprovalRequiredEvent, Bbox, Citation, MeResponse, Project, SseEvent } from '@opex/shared';
import { createConversation, decideApproval, fetchProjects, submitFeedback } from '../lib/api';
import { streamMessage } from '../lib/sse';
import { AppShell } from '../components/AppShell';
import { Composer } from '../components/Composer';
import { MessageList, type DisplayMessage } from '../components/MessageList';
import { AgentTimeline } from '../components/AgentTimeline';
import { ArtifactsPanel, type DisplayArtifact } from '../components/ArtifactsPanel';
import { ApprovalPrompt } from '../components/ApprovalPrompt';
import { Card } from '../components/ui/Card';
import type { AdminSection } from './admin/AdminLayout';

export function ChatPage({
  user,
  isAdmin,
  onLoggedOut,
  onActiveProjectChange,
  onOpenDocuments,
  onOpenMyMemories,
  onOpenCitation,
  onOpenAdmin,
}: {
  user: MeResponse;
  isAdmin: boolean;
  onLoggedOut: () => void;
  onActiveProjectChange: (project: Project) => void;
  onOpenDocuments: () => void;
  onOpenMyMemories: () => void;
  onOpenCitation: (documentId: string, page: number, bbox: Bbox) => void;
  onOpenAdmin: (section: AdminSection) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [conversationId, setConversationId] = useState<string | null>(null);
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
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchProjects().then((rows) => {
      setProjects(rows);
      if (rows[0]) setProjectId(rows[0].id);
    });
    return () => {
      if (elapsedTimerRef.current !== null) clearInterval(elapsedTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const project = projects.find((p) => p.id === projectId);
    if (project) onActiveProjectChange(project);
    // Reset conversation when switching projects — a conversation belongs to one project.
    setConversationId(null);
    setMessages([]);
    setTimelineEvents([]);
    setArtifacts([]);
    setLastRoutedAgent(null);
  }, [projectId, projects]);

  function startNewChat() {
    setConversationId(null);
    setMessages([]);
    setTimelineEvents([]);
    setArtifacts([]);
    setLastRoutedAgent(null);
    setPendingApproval(null);
  }

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const conv = await createConversation(projectId);
    setConversationId(conv.id);
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
        onStatus: (state, model) => setStatus(`${state}: ${model}`),
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
      onNavigate={(key) => {
        if (key === 'documents') return onOpenDocuments();
        if (key === 'my-memories') return onOpenMyMemories();
        onOpenAdmin(key as AdminSection);
      }}
    >
      <div className="mx-auto flex h-full max-w-5xl gap-6 p-6">
        <div className="flex flex-1 flex-col">
          <div className="mb-4 flex items-center justify-between">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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
              </div>
              <div className="grid w-full max-w-xl grid-cols-2 gap-3">
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
          <div className="w-80 shrink-0 overflow-y-auto">
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
