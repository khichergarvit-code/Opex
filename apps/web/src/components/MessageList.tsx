import type { Citation, MessageRole } from '@opex/shared';
import { CitationChip } from './CitationChip';
import { StatusPill } from './ui/Badge';

export interface DisplayMessage {
  id: string;
  role: MessageRole;
  content: string;
  citations?: Citation[];
  /** Set from the real `verify` SSE event for a doc_qa answer — never fabricated. */
  confidence?: 'high' | 'low';
  revisions?: number;
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
  onFeedback,
}: {
  messages: DisplayMessage[];
  onOpenCitation: (c: Citation) => void;
  onFeedback?: (messageId: string, rating: 'thumbs_up' | 'thumbs_down') => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((m) => (
        <div key={m.id} className={`flex max-w-[80%] flex-col gap-1.5 ${m.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
          <div
            className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
              m.role === 'user' ? 'bg-accent-500 text-white' : 'border border-gray-100 bg-white text-gray-800 shadow-card'
            }`}
          >
            {renderContentWithCitations(m.content, m.citations ?? [], onOpenCitation)}
          </div>
          {m.role === 'assistant' && (m.confidence || onFeedback) && (
            <div className="flex items-center gap-2 text-xs">
              {m.confidence && (
                <StatusPill
                  tone={m.confidence === 'high' ? 'success' : 'warning'}
                  title={m.revisions !== undefined ? `${m.revisions} revision(s)` : undefined}
                >
                  {m.confidence === 'high' ? 'Grounded' : 'Low confidence'}
                </StatusPill>
              )}
              {onFeedback && (
                <div className="flex gap-1">
                  <button onClick={() => onFeedback(m.id, 'thumbs_up')} title="Good answer" className="rounded px-1 hover:bg-gray-100">
                    👍
                  </button>
                  <button onClick={() => onFeedback(m.id, 'thumbs_down')} title="Bad answer" className="rounded px-1 hover:bg-gray-100">
                    👎
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
