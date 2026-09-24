import { useState } from 'react';
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
  source?: 'documents' | 'general' | null;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function ActionButton({ label, icon, onClick }: { label: string; icon: 'copy' | 'edit' | 'refresh' | 'check'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-accent-100 hover:text-accent-700 active:scale-90"
    >
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ActionButton
      label={copied ? 'Copied' : 'Copy'}
      icon={copied ? 'check' : 'copy'}
      onClick={() => {
        void copyText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    />
  );
}

function EditBox({ initial, onSave, onCancel }: { initial: string; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const save = () => text.trim() && onSave(text.trim());
  return (
    <div className="flex w-full min-w-[min(28rem,80vw)] flex-col gap-2 rounded-3xl border border-accent-400 bg-surface p-3 shadow-card">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
          }
          if (e.key === 'Escape') onCancel();
        }}
        rows={3}
        aria-label="Edit your message"
        className="w-full resize-none bg-transparent text-[15px] leading-7 outline-none"
      />
      <div className="flex justify-end gap-2 text-sm">
        <button type="button" onClick={onCancel} className="rounded-full px-4 py-1.5 text-fg-2 hover:bg-raised">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={!text.trim()} className="rounded-full bg-accent-600 px-4 py-1.5 font-medium text-on-accent disabled:opacity-50">
          Save &amp; re-run
        </button>
      </div>
    </div>
  );
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
  onEdit,
  onRegenerate,
  busy = false,
  pending,
}: {
  messages: DisplayMessage[];
  onOpenCitation: (c: Citation) => void;
  onFeedback?: (messageId: string, rating: 'thumbs_up' | 'thumbs_down') => void;
  /** Edit a sent user message and re-run from there (drops later turns). */
  onEdit?: (messageId: string, text: string) => void;
  /** Re-run the answer to the user message before this assistant message. */
  onRegenerate?: (assistantMessageId: string) => void;
  busy?: boolean;
  /** What the server is doing for the newest assistant message, while it is being produced. */
  pending?: { label: string; elapsedMs: number } | null;
}) {
  const lastId = messages[messages.length - 1]?.id;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rated, setRated] = useState<Record<string, 'thumbs_up' | 'thumbs_down'>>({});
  const rate = (id: string, rating: 'thumbs_up' | 'thumbs_down') => {
    setRated((prev) => ({ ...prev, [id]: rating }));
    onFeedback?.(id, rating);
  };
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
          {editingId === m.id && onEdit ? (
            <EditBox
              initial={m.content}
              onCancel={() => setEditingId(null)}
              onSave={(text) => {
                setEditingId(null);
                onEdit(m.id, text);
              }}
            />
          ) : (
          <div
            className={`whitespace-pre-wrap text-[15px] leading-7 ${
              m.role === 'user'
                ? 'rounded-3xl rounded-br-lg bg-accent-100 px-5 py-3 text-fg'
                : 'rounded-3xl rounded-bl-lg bg-surface px-5 py-3 text-fg shadow-card'
            }`}
          >
            {m.content === '' && progressLine(m) ? progressLine(m) : renderContentWithCitations(m.content, m.citations ?? [], onOpenCitation)}
          </div>
          )}
          {m.content !== '' && progressLine(m)}
          {m.role === 'user' && !busy && editingId !== m.id && (
            <div className="flex items-center gap-1 text-xs">
              <CopyButton text={m.content} />
              {onEdit && <ActionButton label="Edit" icon="edit" onClick={() => setEditingId(m.id)} />}
            </div>
          )}
          {m.role === 'assistant' && m.content !== '' && (
            <div className="flex flex-wrap items-center gap-1 text-xs">
              {m.source === 'general' && (
                <StatusPill tone="warning" title="No document supported this answer, so it comes from the model's general knowledge.">
                  General knowledge · not from your documents
                </StatusPill>
              )}
              {m.confidence && (
                <StatusPill
                  tone={m.confidence === 'high' ? 'success' : 'warning'}
                  title={m.revisions !== undefined ? `${m.revisions} revision(s)` : undefined}
                >
                  {m.confidence === 'high' ? 'Grounded' : 'Low confidence'}
                </StatusPill>
              )}
              <CopyButton text={m.content} />
              {onRegenerate && !busy && <ActionButton label="Regenerate" icon="refresh" onClick={() => onRegenerate(m.id)} />}
              {onFeedback && !busy && (
                <>
                  <button
                    type="button"
                    onClick={() => rate(m.id, 'thumbs_up')}
                    aria-pressed={rated[m.id] === 'thumbs_up'}
                    title="Good answer"
                    aria-label="Good answer"
                    className={`grid h-8 w-8 place-items-center rounded-full transition-colors active:scale-90 ${rated[m.id] === 'thumbs_up' ? 'bg-accent-100 text-accent-700' : 'text-muted hover:bg-accent-100 hover:text-accent-700'}`}
                  >
                    <Icon name="thumbs" className={`h-4 w-4 ${rated[m.id] === 'thumbs_up' ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => rate(m.id, 'thumbs_down')}
                    aria-pressed={rated[m.id] === 'thumbs_down'}
                    title="Bad answer"
                    aria-label="Bad answer"
                    className={`grid h-8 w-8 place-items-center rounded-full transition-colors active:scale-90 ${rated[m.id] === 'thumbs_down' ? 'bg-danger-50 text-danger-700' : 'text-muted hover:bg-danger-50 hover:text-danger-700'}`}
                  >
                    <Icon name="thumbs" className={`h-4 w-4 rotate-180 ${rated[m.id] === 'thumbs_down' ? 'fill-current' : ''}`} />
                  </button>
                </>
              )}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
