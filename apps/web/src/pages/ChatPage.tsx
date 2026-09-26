import { useEffect, useRef, useState } from 'react';
import type { ApprovalRequiredEvent, Bbox, Citation, MeResponse, Project, SseEvent } from '@opex/shared';
import {
  createConversation,
  decideApproval,
  fetchConversation,
  fetchChatModels,
  fetchConversations,
  fetchProjects,
  forgetMemory,
  stopConversation,
  submitFeedback,
  uploadAttachment,
  type MessageAttachment,
  type ChatModelOption,
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
import { Alert } from '../components/ui/Alert';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '../components/ui/Icon';

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
  const [pendingImages, setPendingImages] = useState<MessageAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [chatModels, setChatModels] = useState<ChatModelOption[]>([]);
  const [modelId, setModelId] = useState<string>(() => {
    try {
      return localStorage.getItem('opex.chatModel') ?? '';
    } catch {
      return '';
    }
  });
  const [documentMode, setDocumentMode] = useState<'auto' | 'on' | 'off'>('auto');
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userMsgIdRef = useRef<string>('');
  const assistantIdRef = useRef<string>('');
  const activeConvRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const skipLoadForRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchChatModels()
      .then((list) => {
        setChatModels(list);
        setModelId((current) => (list.some((m) => m.id === current) ? current : (list.find((m) => m.isDefault) ?? list[0])?.id ?? ''));
      })
      .catch(() => {});
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
    setPendingImages([]);
    setDocumentMode('auto');
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
          setDocumentMode(conversation.documentMode ?? 'auto');
          const visible = stored.filter((m) => m.role !== 'system');
          setMessages(visible.map((m) => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content, citations: m.citations ?? [], attachments: m.attachments ?? [], source: m.source ?? null })));
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

  function notifyChatsChanged() {
    window.dispatchEvent(new Event('opex:chats-changed'));
  }

  function changeModel(id: string) {
    setModelId(id);
    try {
      localStorage.setItem('opex.chatModel', id);
    } catch {
      // localStorage unavailable — the choice just isn't remembered
    }
  }

  function stopGenerating() {
    abortRef.current?.abort();
    if (activeConvRef.current) stopConversation(activeConvRef.current).catch(() => {});
    // Show the result at once; the server finishes closing the turn in the background.
    setStreaming(false);
    setProgress(null);
    setStatus('Stopped');
    stopElapsedTimer();
    setMessages((prev) =>
      prev.map((m) => (m.id === assistantIdRef.current && m.content === '' ? { ...m, content: '(stopped before an answer was written)' } : m)),
    );
  }

  async function handleAttach(files: File[]) {
    if (!projectId) return;
    const allowed = files.filter((f) => ['image/png', 'image/jpeg', 'image/webp'].includes(f.type) && f.size <= 8 * 1024 * 1024);
    if (allowed.length < files.length) setStatus('Only PNG, JPEG or WebP images up to 8 MB can be attached.');
    const room = 4 - pendingImages.length;
    if (allowed.length === 0 || room <= 0) return;
    setUploading(true);
    try {
      const convId = await ensureConversation();
      for (const file of allowed.slice(0, room)) {
        const uploaded = await uploadAttachment(convId, file);
        setPendingImages((prev) => [...prev, uploaded]);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'could not upload the image');
    } finally {
      setUploading(false);
    }
  }

  function handleSend(content: string) {
    return runTurn(content);
  }

  /** Edit: drop the message and everything after it, then re-run with the new text. */
  function handleEdit(messageId: string, text: string) {
    if (streaming) return;
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    const original = messages[idx]!;
    return runTurn(text, { replaceFromMessageId: messageId, keepBefore: idx, attachments: original.attachments });
  }

  function handleRegenerate(assistantMessageId: string) {
    if (streaming) return;
    const idx = messages.findIndex((m) => m.id === assistantMessageId);
    const userMsg = messages[idx - 1];
    if (idx < 1 || !userMsg || userMsg.role !== 'user') return;
    return runTurn(userMsg.content, { replaceFromMessageId: userMsg.id, keepBefore: idx - 1, attachments: userMsg.attachments });
  }

  async function runTurn(
    content: string,
    replace?: { replaceFromMessageId: string; keepBefore: number; attachments?: MessageAttachment[] },
  ) {
    if (!projectId) return;
    const convId = await ensureConversation();
    activeConvRef.current = convId;
    const sentImages = replace ? (replace.attachments ?? []) : pendingImages;
    if (!replace) setPendingImages([]);
    userMsgIdRef.current = crypto.randomUUID();
    assistantIdRef.current = crypto.randomUUID();
    const userMsgId = userMsgIdRef.current;
    setMessages((prev) => [
      ...(replace ? prev.slice(0, replace.keepBefore) : prev),
      { id: userMsgId, role: 'user', content, attachments: sentImages },
      { id: assistantIdRef.current, role: 'assistant', content: '', citations: [] },
    ]);
    setAtBottom(true);
    setStreaming(true);
    setStatus(null);
    setTimelineEvents([]);
    setPendingApproval(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = Date.now();
    setElapsedMs(0);
    setProgress('Starting…');
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
          if (event.type === 'memory_used' && event.data.kind !== 'project') {
            setMessages((prev) => prev.map((m) => (m.id === assistantIdRef.current ? { ...m, memoriesUsed: (m.memoriesUsed ?? 0) + 1 } : m)));
          }
          if (event.type === 'memory_saved') {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantIdRef.current ? { ...m, remembered: [...(m.remembered ?? []), event.data] } : m)),
            );
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
            setProgress(null);
            stopElapsedTimer();
          }
        },
        onProgress: (_phase, label) => setProgress(label),
        onUserSaved: (serverId) => {
          setMessages((prev) => prev.map((m) => (m.id === userMsgId ? { ...m, id: serverId } : m)));
        },
        onSource: (kind) => {
          setMessages((prev) => prev.map((m) => (m.id === assistantIdRef.current ? { ...m, source: kind } : m)));
        },
        onReplace: (text) => {
          setMessages((prev) => prev.map((m) => (m.id === assistantIdRef.current ? { ...m, content: text } : m)));
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
        onDone: (messageId, _traceId, timings) => {
          // The assistant message was rendered under a client-generated id
          // while streaming; swap it for the real server id now so feedback
          // (thumbs up/down) submits against a message that actually exists
          // in the messages table, not a 404.
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantIdRef.current ? { ...m, id: messageId, timings } : m)),
          );
          setStreaming(false);
          setStatus(null);
          setProgress(null);
          stopElapsedTimer();
          refreshHistory();
          notifyChatsChanged();
        },
        onError: (message) => {
          // Show the failure where the answer would have been.
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantIdRef.current && m.content === '' ? { ...m, content: `⚠️ ${message}` } : m)),
          );
          setStreaming(false);
          setStatus(null);
          setProgress(null);
          stopElapsedTimer();
          if (/model is not available/i.test(message)) {
            try {
              localStorage.removeItem('opex.chatModel');
            } catch {
              // ignore
            }
            fetchChatModels()
              .then((list) => {
                setChatModels(list);
                setModelId((list.find((x) => x.isDefault) ?? list[0])?.id ?? '');
              })
              .catch(() => {});
          }
        },
      },
      controller.signal,
      modelId || undefined,
      sentImages.map((a) => a.id),
      { documents: documentMode, replaceFromMessageId: replace?.replaceFromMessageId },
    );
    // Aborted by the user clicking Stop — streamMessage resolves normally
    // (fetch-event-source's own abort path, not onError), so finalize here.
    if (controller.signal.aborted) {
      setStreaming(false);
      setStatus('stopped');
      setProgress(null);
      stopElapsedTimer();
      refreshHistory();
      notifyChatsChanged();
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

  // Follow the stream while the reader is at the bottom; leave them alone once they scroll up.
  useEffect(() => {
    if (atBottom && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, atBottom]);

  // "Summarise" on the Documents page hands over a request through sessionStorage.
  useEffect(() => {
    if (!projectId || projects.length === 0 || conversationId) return;
    let payload: { projectId: string; text: string } | null = null;
    try {
      const raw = sessionStorage.getItem('opex.autoSend');
      payload = raw ? (JSON.parse(raw) as { projectId: string; text: string }) : null;
    } catch {
      payload = null;
    }
    if (!payload) return;
    if (payload.projectId !== projectId && projects.some((p) => p.id === payload.projectId)) {
      setProjectId(payload.projectId);
      return;
    }
    try {
      sessionStorage.removeItem('opex.autoSend');
    } catch {
      // ignore
    }
    void handleSend(payload.text);
  }, [projectId, projects.length]);

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
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
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
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg-2 hover:bg-raised"
              >
                History
              </button>
              {showHistory && (
                <div className="absolute left-0 top-full z-20 mt-1 max-h-80 w-72 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
                  {history.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-faint">No saved chats yet.</p>
                  ) : (
                    history.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setShowHistory(false);
                          navigate({ name: 'chat', conversationId: c.id });
                        }}
                        className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-raised ${c.id === conversationId ? 'bg-accent-50 font-medium text-accent-700' : 'text-fg-2'}`}
                      >
                        {c.title || 'Untitled chat'}
                        <span className="block text-xs font-normal text-faint">{new Date(c.updatedAt).toLocaleString()}</span>
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
                <p className="text-[40px] font-normal leading-tight tracking-tight text-fg">
                  Good {timeOfDay}, {greetingName}
                </p>
                <p className="mt-2 text-base text-muted">How can I help you today?</p>
              </div>
              <div className="w-full max-w-xl">
                {status && <Alert className="mb-2">{status}</Alert>}
                <Composer disabled={!projectId} onSend={handleSend} models={chatModels} modelId={modelId} onModelChange={changeModel} attachments={pendingImages} uploading={uploading} onAttach={handleAttach} onRemoveAttachment={(id) => setPendingImages((prev) => prev.filter((a) => a.id !== id))} documents={documentMode} onDocumentsChange={setDocumentMode} />
                {!projectId && projects.length === 0 && (
                  <p className="mt-2 text-center text-xs text-faint">
                    You're not a member of any project yet — ask an admin to add you to one.
                  </p>
                )}
              </div>
              <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
                {suggestionTiles.map((tile, i) => (
                  <motion.button
                    key={tile.title}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 + i * 0.06, duration: 0.3, ease: [0.2, 0, 0, 1] }}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={tile.onClick}
                    disabled={!projectId}
                    className="rounded-3xl bg-surface p-5 text-left shadow-card transition-shadow hover:shadow-lift disabled:opacity-50"
                  >
                    <p className="text-sm font-medium text-fg">{tile.title}</p>
                    <p className="mt-1 text-xs text-muted">{tile.description}</p>
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="relative flex min-h-0 flex-1 flex-col">
              <div
                ref={scrollRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
                }}
                className="flex-1 overflow-y-auto"
              >
                <MessageList
                  busy={streaming}
                  onEdit={handleEdit}
                  onRegenerate={handleRegenerate}
                  onForgetMemory={(id) => {
                    forgetMemory(id)
                      .then(() => setMessages((prev) => prev.map((m) => (m.remembered ? { ...m, remembered: m.remembered.filter((r) => r.id !== id) } : m))))
                      .catch(() => setStatus('could not forget that memory'));
                  }}
                  pending={streaming && progress ? { label: progress, elapsedMs } : null}
                  messages={messages}
                  onOpenCitation={(c) => onOpenCitation(c.documentId, c.page, c.bbox)}
                  onFeedback={(messageId, rating) => {
                    submitFeedback(messageId, rating).catch(() => {});
                  }}
                />
                {status && <p className="mt-2 text-xs text-faint">{status}</p>}
                {pendingApproval && (
                  <ApprovalPrompt
                    event={pendingApproval}
                    deciding={decidingApproval}
                    onApprove={() => handleApprovalDecision('approved')}
                    onDeny={() => handleApprovalDecision('denied')}
                  />
                )}
              </div>
              <AnimatePresence>
                {!atBottom && (
                  <motion.button
                    initial={{ opacity: 0, y: 8, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.9 }}
                    onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
                    aria-label="Scroll to latest message"
                    title="Scroll to latest message"
                    className="absolute bottom-3 left-1/2 grid h-10 w-10 -translate-x-1/2 place-items-center rounded-full border border-line bg-surface text-accent-700 shadow-lift"
                  >
                    <Icon name="arrowDown" />
                  </motion.button>
                )}
              </AnimatePresence>
              </div>
              <div className="mt-4">
                {status && /upload|attach|image|vision/i.test(status) && <Alert className="mb-2">{status}</Alert>}
                <Composer
                  disabled={!projectId || Boolean(pendingApproval)}
                  streaming={streaming}
                  onSend={handleSend}
                  onStop={stopGenerating}
                  models={chatModels}
                  modelId={modelId}
                  onModelChange={changeModel}
                  attachments={pendingImages}
                  uploading={uploading}
                  onAttach={handleAttach}
                  onRemoveAttachment={(id) => setPendingImages((prev) => prev.filter((a) => a.id !== id))}
                  documents={documentMode}
                  onDocumentsChange={setDocumentMode}
                />
              </div>
            </>
          )}
        </div>

        {showTimeline && (
          <div className="w-full shrink-0 overflow-y-auto md:w-80">
            <Card className="!p-3.5">
              <p className="mb-2 text-sm font-semibold text-fg">Activity Run</p>
              <AgentTimeline events={timelineEvents} streaming={streaming} />
            </Card>
            <Card className="mt-2.5 !p-3.5">
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-faint">Current model</p>
              {lastRoutedAgent ? (
                <p className="text-sm text-fg">{lastRoutedAgent} agent</p>
              ) : (
                <p className="text-sm text-faint">No agent routed yet</p>
              )}
            </Card>
            <Card className="mt-2.5 !p-3.5">
              <p className="mb-1.5 text-sm font-semibold text-fg">Artifacts</p>
              <ArtifactsPanel artifacts={artifacts} />
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
