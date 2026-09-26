import { useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import type { ChatModelOption, MessageAttachment, PendingDoc } from '../lib/api';
import { Icon } from './ui/Icon';
import { shortModelName } from '../lib/format';

export function Composer({
  disabled,
  streaming = false,
  onSend,
  onStop,
  models = [],
  modelId,
  onModelChange,
  attachments = [],
  uploading = false,
  onAttach,
  onRemoveAttachment,
  docs = [],
  onRemoveDoc,
  onRetryDoc,
  documents,
  onDocumentsChange,
}: {
  disabled: boolean;
  streaming?: boolean;
  onSend: (content: string) => void;
  onStop?: () => void;
  models?: ChatModelOption[];
  modelId?: string;
  onModelChange?: (id: string) => void;
  /** Images already uploaded for the message being written. */
  attachments?: MessageAttachment[];
  uploading?: boolean;
  onAttach?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  /** Documents (PDF etc.) being read for this message. */
  docs?: PendingDoc[];
  onRemoveDoc?: (key: string) => void;
  onRetryDoc?: (key: string) => void;
  documents?: 'auto' | 'on' | 'off';
  onDocumentsChange?: (mode: 'auto' | 'on' | 'off') => void;
}) {
  const docsBusy = docs.some((d) => d.status !== 'ready' && d.status !== 'failed');
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = useState(false);
  const [value, setValue] = useState('');

  function submit() {
    if ((!value.trim() && attachments.length === 0) || disabled || streaming || uploading || docsBusy) return;
    onSend(value.trim() || (attachments.length === 0 && docs.length > 0 ? 'Summarise this document.' : 'Describe this image.'));
    setValue('');
    if (taRef.current) taRef.current.style.height = 'auto';
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  // Enter sends; Shift+Enter inserts a newline — the textarea's default
  // Enter behavior (newline) is what we override, not the other way round.
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (files.length > 0 && onAttach) {
      e.preventDefault();
      onAttach(files);
    }
  }

  function handleDrop(e: DragEvent<HTMLFormElement>) {
    e.preventDefault();
    setDragging(false);
    const files = [...e.dataTransfer.files];
    if (files.length > 0 && onAttach) onAttach(files);
  }

  const chip =
    'appearance-none rounded-full border border-line bg-canvas py-1.5 pl-3 pr-7 text-xs text-fg-2 outline-none transition-colors hover:border-accent-300 focus-visible:border-accent-400 disabled:opacity-50';
  const canSend = !disabled && !streaming && !uploading && !docsBusy && (value.trim() !== '' || attachments.length > 0 || docs.some((d) => d.status === 'ready'));
  return (
    <form
      onDragOver={(e) => { e.preventDefault(); if (onAttach) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onSubmit={handleSubmit}
      className={`flex flex-col gap-2 rounded-[28px] border ${dragging ? 'border-accent-500 bg-accent-50' : 'border-line bg-surface'} px-4 pb-3 pt-3 shadow-card transition-[border-color,box-shadow] duration-200 focus-within:border-accent-400 focus-within:ring-4 focus-within:ring-accent-100`}
    >
      {docs.length > 0 && (
        <div className="flex w-full flex-wrap gap-2">
          {docs.map((d) => (
            <span key={d.key} className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-line bg-canvas px-3 py-2 text-sm text-fg">
              <Icon name="file" className="h-4 w-4 shrink-0 text-accent-600" />
              <span className="max-w-[14rem] truncate">{d.name}</span>
              <span className={`text-xs ${d.status === 'failed' ? 'text-danger-700' : 'text-muted'}`}>
                {d.status === 'ready' ? 'Ready' : d.status === 'failed' ? `Couldn't read it: ${d.error ?? 'unknown error'}` : 'Reading…'}
              </span>
              {d.status === 'failed' && d.id && onRetryDoc && (
                <button type="button" onClick={() => onRetryDoc(d.key)} className="rounded-full px-2 py-0.5 text-xs font-medium text-accent-700 hover:bg-accent-50">
                  Retry
                </button>
              )}
              {onRemoveDoc && (
                <button type="button" aria-label={`Remove ${d.name}`} onClick={() => onRemoveDoc(d.key)} className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-raised">
                  <Icon name="close" className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {(attachments.length > 0 || uploading) && (
        <div className="flex w-full flex-wrap gap-2">
          {attachments.map((a) => (
            <span key={a.id} className="group relative">
              <img src={`/artifacts/${a.id}`} alt={a.filename} className="h-16 w-16 rounded-2xl object-cover shadow-card" />
              {onRemoveAttachment && (
                <button
                  type="button"
                  aria-label={`Remove ${a.filename}`}
                  onClick={() => onRemoveAttachment(a.id)}
                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-fg text-canvas opacity-90 transition-transform hover:scale-110"
                >
                  <Icon name="close" className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {uploading && <span className="skeleton h-16 w-16 rounded-2xl" aria-label="Uploading image" />}
          {attachments.length > 0 && (
            <span className="self-center text-xs text-muted">Vision model will look at {attachments.length === 1 ? 'this image' : 'these images'}</span>
          )}
        </div>
      )}
      <textarea
        ref={taRef}
        onPaste={handlePaste}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${Math.min(e.target.scrollHeight, 168)}px`;
        }}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything… (Shift+Enter for a new line)"
        disabled={disabled}
        rows={1}
        className="max-h-[168px] w-full resize-none bg-transparent px-1 py-1.5 text-[15px] leading-6 outline-none disabled:opacity-50"
      />
      <div className="flex flex-wrap items-center gap-2">
        {onAttach && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,.pdf,.docx,.pptx,.xlsx,.csv,.html"
              multiple
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                if (files.length > 0) onAttach(files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              aria-label="Attach an image or document"
              title="Attach an image (PNG, JPEG, WebP) or a document (PDF, DOCX, PPTX, XLSX, CSV, HTML). Documents are saved to the project. You can also drop files here."
              disabled={disabled || uploading}
              onClick={() => fileRef.current?.click()}
              className="grid h-9 w-9 place-items-center rounded-full text-fg-2 transition-colors hover:bg-accent-100 hover:text-accent-700 disabled:opacity-50"
            >
              <Icon name="attach" />
            </button>
          </>
        )}
        {documents && onDocumentsChange && (
          <div className="relative">
            <select
              value={documents}
              onChange={(e) => onDocumentsChange(e.target.value as 'auto' | 'on' | 'off')}
              aria-label="Use documents"
              title="Auto: use documents when the question is about them, otherwise answer from general knowledge. Always: only answer from documents. Never: ignore documents in this chat."
              className={chip}
            >
              <option value="auto">Documents: Auto</option>
              <option value="on">Documents: Always</option>
              <option value="off">Documents: Never</option>
            </select>
            <Icon name="arrowDown" className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
          </div>
        )}
        {models.length > 0 && onModelChange && (
          <div className="relative min-w-0">
            <select
              value={modelId}
              onChange={(e) => onModelChange(e.target.value)}
              aria-label="Model"
              title="Choose which model writes the answer. Fast is for plain chat; document, tool and multi-step answers use Quality."
              className={`${chip} max-w-[15rem] truncate pl-7`}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {shortModelName(m.detail)}
                  {m.status === 'down' ? ' (not running)' : m.note ? ` (${m.note})` : ''}
                </option>
              ))}
            </select>
            <span
              aria-hidden="true"
              title={models.find((m) => m.id === modelId)?.status === 'down' ? 'This model is not running right now' : 'Model is running'}
              className={`pointer-events-none absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${models.find((m) => m.id === modelId)?.status === 'down' ? 'bg-danger-600' : 'bg-accent-500'}`}
            />
            <Icon name="arrowDown" className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
          </div>
        )}
        <span className="flex-1" />
        {streaming && onStop ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            title="Stop generating"
            className="grid h-10 w-10 place-items-center rounded-full bg-danger-600 text-white transition-transform hover:scale-105 active:scale-95"
          >
            <Icon name="stop" className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            title="Send (Enter)"
            className="grid h-10 w-10 place-items-center rounded-full bg-accent-600 text-on-accent transition-all hover:scale-105 hover:bg-accent-700 active:scale-95 disabled:scale-100 disabled:opacity-40"
          >
            <Icon name="send" className="h-4 w-4" />
          </button>
        )}
      </div>
    </form>
  );
}
