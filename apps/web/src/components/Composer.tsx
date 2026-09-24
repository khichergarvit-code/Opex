import { useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import type { ChatModelOption, MessageAttachment } from '../lib/api';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';

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
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [value, setValue] = useState('');

  function submit() {
    if ((!value.trim() && attachments.length === 0) || disabled || streaming || uploading) return;
    onSend(value.trim() || 'Describe this image.');
    setValue('');
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
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
    if (files.length > 0 && onAttach) onAttach(files);
  }

  return (
    <form onDragOver={(e) => { e.preventDefault(); if (onAttach) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} onSubmit={handleSubmit} className={`flex flex-wrap items-end gap-2 rounded-[32px] border ${dragging ? 'border-accent-500 bg-accent-50' : 'border-line/60 bg-surface'} p-2.5 pl-5 shadow-card transition-[border-color,box-shadow] duration-200 focus-within:border-accent-400 focus-within:shadow-lift`}>
      {(attachments.length > 0 || uploading) && (
        <div className="flex w-full flex-wrap gap-2 pb-1 pr-2 pt-1">
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
        onPaste={handlePaste}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything… (Shift+Enter for a new line)"
        disabled={disabled}
        rows={1}
        className="min-w-0 flex-1 resize-none basis-48 bg-transparent px-1 py-2 text-[15px] outline-none disabled:opacity-50"
      />
      {onAttach && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              if (files.length > 0) onAttach(files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            aria-label="Attach an image"
            title="Attach an image (PNG, JPEG or WebP). You can also paste or drop one."
            disabled={disabled || streaming}
            onClick={() => fileRef.current?.click()}
            className="grid h-10 w-10 place-items-center rounded-full text-fg-2 transition-colors hover:bg-accent-100 hover:text-accent-700 disabled:opacity-50"
          >
            <Icon name="attach" />
          </button>
        </>
      )}
      {models.length > 0 && onModelChange && (
        <select
          value={modelId}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={streaming}
          aria-label="Model"
          title="Choose which model writes the answer. Fast is for plain chat; document, tool and multi-step answers use Quality."
          className="rounded-full border border-line bg-canvas px-3 py-2 text-xs text-fg-2 disabled:opacity-50"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} · {m.detail}
              {m.note ? ` (${m.note})` : ''}
            </option>
          ))}
        </select>
      )}
      {streaming && onStop && (
        <Button type="button" variant="danger" onClick={onStop}>
          <Icon name="stop" className="h-4 w-4" />
          Stop
        </Button>
      )}
      <Button type="submit" variant="primary" disabled={disabled || streaming || uploading || (!value.trim() && attachments.length === 0)}>
        <Icon name="send" className="h-4 w-4" />
        Send
      </Button>
    </form>
  );
}
