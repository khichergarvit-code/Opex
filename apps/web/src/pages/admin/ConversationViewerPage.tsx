import { useEffect, useState } from 'react';
import {
  ApiError,
  fetchAdminConversationMessages,
  fetchAdminConversations,
  type AdminConversationRow,
  type AdminMessageRow,
} from '../../lib/api';

export function ConversationViewerPage({ onBack }: { onBack: () => void }) {
  const [conversations, setConversations] = useState<AdminConversationRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdminMessageRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminConversations()
      .then(setConversations)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load conversations'));
  }, []);

  useEffect(() => {
    if (!selected) return;
    fetchAdminConversationMessages(selected)
      .then(setMessages)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load messages'));
  }, [selected]);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <button onClick={onBack} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h2>Conversations</h2>
      <p style={{ color: '#6b7280', fontSize: 12 }}>
        Viewing a conversation's messages writes an audit-log entry (this is another user's private data).
      </p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 16 }}>
        <table style={{ width: '50%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '6px 10px' }}>User</th>
              <th style={{ padding: '6px 10px' }}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((c) => (
              <tr
                key={c.id}
                onClick={() => setSelected(c.id)}
                style={{
                  cursor: 'pointer',
                  background: selected === c.id ? '#dbeafe' : undefined,
                  borderBottom: '1px solid #f3f4f6',
                }}
              >
                <td style={{ padding: '6px 10px' }}>{c.userEmail}</td>
                <td style={{ padding: '6px 10px' }}>{c.updatedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ width: '50%', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                background: m.role === 'user' ? '#dbeafe' : '#f3f4f6',
                borderRadius: 8,
                padding: '8px 12px',
                maxWidth: '90%',
                whiteSpace: 'pre-wrap',
                fontSize: 13,
              }}
            >
              {m.content}
            </div>
          ))}
          {selected && messages.length === 0 && <p style={{ color: '#6b7280' }}>No messages.</p>}
        </div>
      </div>
    </div>
  );
}
