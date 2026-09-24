import { useEffect, useState } from 'react';
import {
  ApiError,
  fetchAdminConversationMessages,
  fetchAdminConversations,
  type AdminConversationRow,
  type AdminMessageRow,
} from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Alert } from '../../components/ui/Alert';

export function ConversationViewerPage({ onBack: _onBack }: { onBack: () => void }) {
  const [conversations, setConversations] = useState<AdminConversationRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdminMessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminConversations()
      .then(setConversations)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load conversations'));
  }, []);

  useEffect(() => {
    if (!selected) return;
    // Clear the previous conversation's messages immediately — otherwise
    // switching to a different (possibly empty) conversation briefly shows
    // the old one's messages until the new fetch resolves.
    setMessages([]);
    setMessagesLoading(true);
    fetchAdminConversationMessages(selected)
      .then(setMessages)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load messages'))
      .finally(() => setMessagesLoading(false));
  }, [selected]);

  return (
    <div>
      <PageHeader title="Conversations" description="Viewing a conversation's messages writes an audit-log entry (this is another user's private data)." />
      {error && <Alert>{error}</Alert>}

      <div className="flex gap-4">
        <Card padded={false} className="w-1/2 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs font-medium uppercase text-faint">
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className={`cursor-pointer border-b border-line last:border-0 ${selected === c.id ? 'bg-accent-50' : 'hover:bg-raised'}`}
                >
                  <td className="px-3 py-2">{c.userEmail}</td>
                  <td className="px-3 py-2 text-muted">{c.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="flex w-1/2 flex-col gap-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                m.role === 'user' ? 'self-end bg-raised text-fg' : 'self-start bg-raised text-fg'
              }`}
            >
              {m.content}
            </div>
          ))}
          {selected && messagesLoading && <Skeleton className="p-2" />}
          {selected && !messagesLoading && messages.length === 0 && <EmptyState title="No messages" />}
        </div>
      </div>
    </div>
  );
}
