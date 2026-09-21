import { useEffect, useRef, useState } from 'react';
import type { Bbox, Citation, MeResponse, Project } from '@opex/shared';
import { createConversation, fetchProjects, logout } from '../lib/api';
import { streamMessage } from '../lib/sse';
import { Composer } from '../components/Composer';
import { MessageList, type DisplayMessage } from '../components/MessageList';

export function ChatPage({
  user,
  onLoggedOut,
  onActiveProjectChange,
  onOpenDocuments,
  onOpenCitation,
}: {
  user: MeResponse;
  onLoggedOut: () => void;
  onActiveProjectChange: (project: Project) => void;
  onOpenDocuments: () => void;
  onOpenCitation: (documentId: string, page: number, bbox: Bbox) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
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

    await streamMessage(convId, content, {
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
      onDone: () => {
        setStreaming(false);
        setStatus(null);
      },
      onError: (message) => {
        setStreaming(false);
        setStatus(`error: ${message}`);
      },
    });
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>OpeX</h1>
        <div>
          <button onClick={onOpenDocuments} style={{ marginRight: 12 }}>
            Documents
          </button>
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

      <MessageList
        messages={messages}
        onOpenCitation={(c) => onOpenCitation(c.documentId, c.page, c.bbox)}
      />
      {status && <p style={{ color: '#6b7280', fontSize: 12 }}>{status}</p>}

      <div style={{ marginTop: 16 }}>
        <Composer disabled={streaming || !projectId} onSend={handleSend} />
      </div>
    </div>
  );
}
