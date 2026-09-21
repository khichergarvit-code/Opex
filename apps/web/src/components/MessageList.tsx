import type { Citation, MessageRole } from '@opex/shared';
import { CitationChip } from './CitationChip';

export interface DisplayMessage {
  id: string;
  role: MessageRole;
  content: string;
  citations?: Citation[];
}

/** Splits "...bolt [1] needs..." into text/chip parts, rendering a chip for every [n] with a known citation. */
function renderContentWithCitations(content: string, citations: Citation[], onOpenCitation: (c: Citation) => void) {
  if (citations.length === 0) return content;
  const byMarker = new Map(citations.map((c) => [c.marker, c]));
  const parts = content.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const match = /^\[(\d+)\]$/.exec(part);
    if (match) {
      const citation = byMarker.get(Number(match[1]));
      if (citation) {
        return <CitationChip key={i} citation={citation} onOpen={onOpenCitation} />;
      }
    }
    return <span key={i}>{part}</span>;
  });
}

export function MessageList({
  messages,
  onOpenCitation,
}: {
  messages: DisplayMessage[];
  onOpenCitation: (c: Citation) => void;
}) {
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
          {renderContentWithCitations(m.content, m.citations ?? [], onOpenCitation)}
        </div>
      ))}
    </div>
  );
}
