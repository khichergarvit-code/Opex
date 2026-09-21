import type { MessageRole } from '@opex/shared';

export interface DisplayMessage {
  id: string;
  role: MessageRole;
  content: string;
}

export function MessageList({ messages }: { messages: DisplayMessage[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {messages.map((m) => (
        <div
          key={m.id}
          style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            background: m.role === 'user' ? '#dbeafe' : '#f3f4f6',
            borderRadius: 8,
            padding: '8px 12px',
            maxWidth: '80%',
            whiteSpace: 'pre-wrap',
          }}
        >
          {m.content}
        </div>
      ))}
    </div>
  );
}
