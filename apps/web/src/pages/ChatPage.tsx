import { useEffect, useRef, useState } from 'react';
import type { ApprovalRequiredEvent, Bbox, Citation, MeResponse, Project, SseEvent } from '@opex/shared';
import { createConversation, decideApproval, fetchProjects, logout, submitFeedback } from '../lib/api';
import { streamMessage } from '../lib/sse';
import { Composer } from '../components/Composer';
import { MessageList, type DisplayMessage } from '../components/MessageList';
import { AgentTimeline } from '../components/AgentTimeline';
import { ArtifactsPanel, type DisplayArtifact } from '../components/ArtifactsPanel';
import { ApprovalPrompt } from '../components/ApprovalPrompt';
import type { AdminSection } from './admin/AdminLayout';

export function ChatPage({
  user,
  onLoggedOut,
  onActiveProjectChange,
  onOpenDocuments,
  onOpenCitation,
  onOpenAdmin,
}: {
  user: MeResponse;
  onLoggedOut: () => void;
  onActiveProjectChange: (project: Project) => void;
  onOpenDocuments: () => void;
  onOpenCitation: (documentId: string, page: number, bbox: Bbox) => void;
  onOpenAdmin?: (section: AdminSection) => void;
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
  const assistantIdRef = useRef<string>('');

  useEffect(() => {
    fetchProjects().then((rows) => {
      setProjects(rows);
      if (rows[0]) setProjectId(rows[0].id);
    });
  }, []);

  useEffect(() => {
    const project = projects.find((p) => p.id === projectId);
    if (project) onActiveProjectChange(project);
    // Reset conversation when switching projects — a conversation belongs to one project.
    setConversationId(null);
    setMessages([]);
    setTimelineEvents([]);
    setArtifacts([]);
  }, [projectId, projects]);

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const conv = await createConversation(projectId);
    setConversationId(conv.id);
    return conv.id;
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

    await streamMessage(convId, content, {
      onEvent: (event) => {
        setTimelineEvents((prev) => [...prev, event]);
        if (event.type === 'tool_result') {
          const newArtifacts = event.data.artifactIds.map((id) => ({ id, toolName: 'tool' }));
          if (newArtifacts.length > 0) setArtifacts((prev) => [...prev, ...newArtifacts]);
        }
        if (event.type === 'approval_required') {
          // The SSE stream ends right after this (conversations.ts skips
          // the normal done/error finalization while paused) — stop
          // treating the composer as busy so the approval card can act.
          setPendingApproval(event.data);
          setStreaming(false);
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
      },
      onError: (message) => {
        setStreaming(false);
        setStatus(`error: ${message}`);
      },
    });
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

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>OpeX</h1>
        <div>
          <button onClick={onOpenDocuments} style={{ marginRight: 12 }}>
            Documents
          </button>
          <button onClick={() => setShowTimeline((v) => !v)} style={{ marginRight: 12 }}>
            {showTimeline ? 'Hide' : 'Show'} timeline
          </button>
          {onOpenAdmin && (
            <button onClick={() => onOpenAdmin('traces')} style={{ marginRight: 12 }}>
              Admin
            </button>
          )}
          <span style={{ marginRight: 12 }}>
            {user.email} ({user.role})
          </span>
          <button onClick={() => logout().then(onLoggedOut)}>Sign out</button>
        </div>
      </header>

      <div style={{ marginBottom: 12 }}>
        <label>
          Project:{' '}
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <MessageList
            messages={messages}
            onOpenCitation={(c) => onOpenCitation(c.documentId, c.page, c.bbox)}
            onFeedback={(messageId, rating) => {
              submitFeedback(messageId, rating).catch(() => {});
            }}
          />
          {status && <p style={{ color: '#6b7280', fontSize: 12 }}>{status}</p>}
          {pendingApproval && (
            <ApprovalPrompt
              event={pendingApproval}
              deciding={decidingApproval}
              onApprove={() => handleApprovalDecision('approved')}
              onDeny={() => handleApprovalDecision('denied')}
            />
          )}

          <div style={{ marginTop: 16 }}>
            <Composer disabled={streaming || !projectId || Boolean(pendingApproval)} onSend={handleSend} />
          </div>
        </div>

        {showTimeline && (
          <div style={{ width: 320, flexShrink: 0 }}>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>Timeline</h3>
            <AgentTimeline events={timelineEvents} />
            <h3 style={{ fontSize: 14, marginTop: 16, marginBottom: 8 }}>Artifacts</h3>
            <ArtifactsPanel artifacts={artifacts} />
          </div>
        )}
      </div>
    </div>
  );
}
