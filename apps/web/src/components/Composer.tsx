import { useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ChatModelOption } from '../lib/api';
import { Button } from './ui/Button';

export function Composer({
  disabled,
  streaming = false,
  onSend,
  onStop,
  models = [],
  modelId,
  onModelChange,
}: {
  disabled: boolean;
  streaming?: boolean;
  onSend: (content: string) => void;
  onStop?: () => void;
  models?: ChatModelOption[];
  modelId?: string;
  onModelChange?: (id: string) => void;
}) {
  const [value, setValue] = useState('');

  function submit() {
    if (!value.trim() || disabled || streaming) return;
    onSend(value);
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-card">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything… (Shift+Enter for a new line)"
        disabled={disabled}
        rows={1}
        className="min-w-0 flex-1 resize-none basis-48 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-100 disabled:opacity-50"
      />
      {models.length > 0 && onModelChange && (
        <select
          value={modelId}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={streaming}
          aria-label="Model"
          title="Choose which model writes the answer. Fast is for plain chat; document, tool and multi-step answers use Quality."
          className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs text-gray-700 disabled:opacity-50"
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
          ■ Stop
        </Button>
      )}
      <Button type="submit" variant="primary" disabled={disabled || streaming || !value.trim()}>
        Send
      </Button>
    </form>
  );
}
