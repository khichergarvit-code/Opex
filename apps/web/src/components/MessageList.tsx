import { motion } from 'motion/react';
import type { Citation, MessageRole } from '@opex/shared';
import type { MessageAttachment } from '../lib/api';
import { TypingDots } from './ui/TypingDots';
import { Icon } from './ui/Icon';
import { CitationChip } from './CitationChip';
import { StatusPill } from './ui/Badge';

export interface DisplayMessage {
  id: string;
  role: MessageRole;
  content: string;
  citations?: Citation[];
  attachments?: MessageAttachment[];
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
  pending,
}: {
  messages: DisplayMessage[];
  onOpenCitation: (c: Citation) => void;
  onFeedback?: (messageId: string, rating: 'thumbs_up' | 'thumbs_down') => void;
  /** What the server is doing for the newest assistant message, while it is being produced. */
  pending?: { label: string; elapsedMs: number } | null;
}) {
  const lastId = messages[messages.length - 1]?.id;
  const progressLine = (m: DisplayMessage) =>
    pending && m.id === lastId && m.role === 'assistant' ? (
      <span className="flex items-center gap-2.5 text-xs text-muted">
        <TypingDots />
        {pending.label} · {(pending.elapsedMs / 1000).toFixed(0)}s
      </span>
    ) : null;
  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => (
        <motion.div
          key={m.id}
          initial={{ opacity: 0, y: 12, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
          className={`flex flex-col gap-1.5 ${m.role === 'user' ? 'max-w-[80%] self-end items-end' : 'max-w-[92%] self-start items-start'}`}
        >
          {m.attachments && m.attachments.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2">
              {m.attachments.map((a) => (
                <a key={a.id} href={`/artifacts/${a.id}`} target="_blank" rel="noreferrer">
                  <img src={`/artifacts/${a.id}`} alt={a.filename} className="max-h-52 max-w-[16rem] rounded-2xl object-cover shadow-card" />
                </a>
              ))}
            </div>
          )}
          <div
            className={`whitespace-pre-wrap text-[15px] leading-7 ${
              m.role === 'user'
                ? 'rounded-3xl rounded-br-lg bg-accent-100 px-5 py-3 text-fg'
                : 'rounded-3xl rounded-bl-lg bg-surface px-5 py-3 text-fg shadow-card'
            }`}
          >
            {m.content === '' && progressLine(m) ? progressLine(m) : renderContentWithCitations(m.content, m.citations ?? [], onOpenCitation)}
          </div>
          {m.content !== '' && progressLine(m)}
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
                  <button
                    onClick={() => onFeedback(m.id, 'thumbs_up')}
                    title="Good answer"
                    aria-label="Good answer"
                    className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-accent-100 hover:text-accent-700 active:scale-90"
                  >
                    <Icon name="thumbs" className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onFeedback(m.id, 'thumbs_down')}
                    title="Bad answer"
                    aria-label="Bad answer"
                    className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-danger-50 hover:text-danger-700 active:scale-90"
                  >
                    <Icon name="thumbs" className="h-4 w-4 rotate-180" />
                  </button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
