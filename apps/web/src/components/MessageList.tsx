import { useState } from 'react';
import { motion } from 'motion/react';
import type { Citation, MessageRole } from '@opex/shared';
import type { MessageAttachment } from '../lib/api';
import { TypingDots } from './ui/TypingDots';
import { Icon } from './ui/Icon';
import { CitationChip } from './CitationChip';
import { StatusPill } from './ui/Badge';
import { FileViewer } from './FileViewer';

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
  /** The signed-in user's saved rating of this answer (persisted on the server). */
  rating?: 'thumbs_up' | 'thumbs_down' | null;
  /** How many remembered facts about the user were given to the model for this answer. */
  memoriesUsed?: number;
  timings?: { totalMs: number; routeMs?: number; firstTokenMs?: number; tokens: number; tokensPerSecond?: number };
  /** Facts just saved to memory because of the user message this answers. */
  remembered?: Array<{ id: string; text: string }>;
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
  onForgetMemory,
  busy = false,
  pending,
}: {
  messages: DisplayMessage[];
  onOpenCitation: (c: Citation) => void;
  onFeedback?: (messageId: string, rating: 'thumbs_up' | 'thumbs_down') => Promise<'thumbs_up' | 'thumbs_down' | null> | void;
  /** Edit a sent user message and re-run from there (drops later turns). */
  onEdit?: (messageId: string, text: string) => void;
  /** Re-run the answer to the user message before this assistant message. */
  onRegenerate?: (assistantMessageId: string) => void;
  onForgetMemory?: (id: string) => void;
  busy?: boolean;
  /** What the server is doing for the newest assistant message, while it is being produced. */
  pending?: { label: string; elapsedMs: number } | null;
}) {
  const lastId = messages[messages.length - 1]?.id;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<MessageAttachment | null>(null);
  const [rated, setRated] = useState<Record<string, 'thumbs_up' | 'thumbs_down' | null>>({});
  // Clicking the same rating again removes it (un-like); the server is the source of truth.
  const ratingOf = (m: DisplayMessage) => (m.id in rated ? rated[m.id] : m.rating) ?? null;
  const rate = (m: DisplayMessage, rating: 'thumbs_up' | 'thumbs_down') => {
    const next = ratingOf(m) === rating ? null : rating;
    setRated((prev) => ({ ...prev, [m.id]: next }));
    Promise.resolve(onFeedback?.(m.id, rating))
      .then((saved) => {
        if (saved !== undefined) setRated((prev) => ({ ...prev, [m.id]: saved }));
      })
      .catch(() => setRated((prev) => ({ ...prev, [m.id]: ratingOf(m) })));
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
            <div className={`flex flex-wrap gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.attachments.map((a) =>
                a.mime.startsWith('image/') ? (
                  <a key={a.id} href={`/artifacts/${a.id}`} target="_blank" rel="noreferrer">
                    <img
                      src={`/artifacts/${a.id}`}
                      alt={a.filename}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                      className={`rounded-2xl object-cover shadow-card ${m.role === 'assistant' ? 'max-h-80 max-w-[min(24rem,100%)]' : 'max-h-52 max-w-[16rem]'}`}
                    />
                  </a>
                ) : (
                  <span key={a.id} className="inline-flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm text-fg shadow-card">
                    <Icon name="file" className="h-5 w-5 text-accent-600" />
                    <span className="flex min-w-0 flex-col">
                      <span className="max-w-[16rem] truncate font-medium">{a.filename}</span>
                      <span className="text-xs text-muted">Saved in your files</span>
                    </span>
                    <button type="button" onClick={() => setOpenFile(a)} className="rounded-full px-3 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50">
                      Open
                    </button>
                    <a href={`/artifacts/${a.id}`} download={a.filename} className="rounded-full px-3 py-1 text-xs text-fg-2 hover:bg-raised">
                      Download
                    </a>
                  </span>
                ),
              )}
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
                ? 'rounded-2xl bg-raised px-4 py-2.5 text-fg'
                : m.content.startsWith('⚠️ ')
                  ? 'flex items-start gap-2.5 rounded-xl bg-danger-50 px-4 py-3 text-danger-700'
                  : 'py-1 text-fg'
            }`}
          >
            {m.role === 'assistant' && m.content.startsWith('⚠️ ') ? (
              <>
                <Icon name="alert" className="mt-1.5 h-4 w-4 shrink-0" />
                <span>{m.content.slice(3)}</span>
              </>
            ) : m.content === '' && progressLine(m) ? (
              progressLine(m)
            ) : (
              renderContentWithCitations(m.content, m.citations ?? [], onOpenCitation)
            )}
          </div>
          )}
          {m.content !== '' && progressLine(m)}
          {m.role === 'user' && !busy && editingId !== m.id && (
            <div className="flex items-center gap-1 text-xs">
              <CopyButton text={m.content} />
              {onEdit && <ActionButton label="Edit" icon="edit" onClick={() => setEditingId(m.id)} />}
            </div>
          )}
          {m.role === 'assistant' && m.remembered && m.remembered.length > 0 && (
            <div className="flex flex-col gap-1 text-xs">
              {m.remembered.map((r) => (
                <span key={r.id} className="inline-flex flex-wrap items-center gap-2 rounded-full bg-accent-50 px-3 py-1 text-accent-700">
                  <Icon name="check" className="h-3.5 w-3.5" />
                  Remembered: {r.text}
                  {onForgetMemory && (
                    <button type="button" onClick={() => onForgetMemory(r.id)} className="font-medium underline underline-offset-2 hover:text-accent-700">
                      Forget
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          {m.role === 'assistant' && m.content !== '' && (
            <div className="flex flex-wrap items-center gap-1 text-xs">
              {m.timings && (
                <span
                  className="mr-1 text-faint"
                  title={`Total ${(m.timings.totalMs / 1000).toFixed(1)}s${m.timings.routeMs ? ` · routing ${(m.timings.routeMs / 1000).toFixed(1)}s` : ''}${m.timings.tokens ? ` · ${m.timings.tokens} tokens` : ''}`}
                >
                  {m.timings.firstTokenMs ? `${(m.timings.firstTokenMs / 1000).toFixed(1)}s to first word` : `${(m.timings.totalMs / 1000).toFixed(1)}s`}
                  {m.timings.tokensPerSecond ? ` · ${m.timings.tokensPerSecond} tok/s` : ''}
                </span>
              )}
              {(m.memoriesUsed ?? 0) > 0 && (
                <StatusPill tone="info" title="Facts OpeX remembered about you were used for this answer">
                  Used {m.memoriesUsed} {m.memoriesUsed === 1 ? 'memory' : 'memories'}
                </StatusPill>
              )}
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
                    onClick={() => rate(m, 'thumbs_up')}
                    aria-pressed={ratingOf(m) === 'thumbs_up'}
                    title={ratingOf(m) === 'thumbs_up' ? 'Remove your like' : 'Good answer'}
                    aria-label="Good answer"
                    className={`grid h-8 w-8 place-items-center rounded-full transition-colors active:scale-90 ${ratingOf(m) === 'thumbs_up' ? 'bg-accent-100 text-accent-700' : 'text-muted hover:bg-accent-100 hover:text-accent-700'}`}
                  >
                    <Icon name="thumbs" className={`h-4 w-4 ${ratingOf(m) === 'thumbs_up' ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => rate(m, 'thumbs_down')}
                    aria-pressed={ratingOf(m) === 'thumbs_down'}
                    title={ratingOf(m) === 'thumbs_down' ? 'Remove your dislike' : 'Bad answer'}
                    aria-label="Bad answer"
                    className={`grid h-8 w-8 place-items-center rounded-full transition-colors active:scale-90 ${ratingOf(m) === 'thumbs_down' ? 'bg-danger-50 text-danger-700' : 'text-muted hover:bg-danger-50 hover:text-danger-700'}`}
                  >
                    <Icon name="thumbs" className={`h-4 w-4 rotate-180 ${ratingOf(m) === 'thumbs_down' ? 'fill-current' : ''}`} />
                  </button>
                </>
              )}
            </div>
          )}
        </motion.div>
      ))}
      {openFile && <FileViewer name={openFile.filename} src={`/artifacts/${openFile.id}`} downloadUrl={`/artifacts/${openFile.id}`} onClose={() => setOpenFile(null)} />}
    </div>
  );
}
