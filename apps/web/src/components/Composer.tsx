import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from './ui/Button';

export function Composer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (content: string) => void;
}) {
  const [value, setValue] = useState('');

  function submit() {
    if (!value.trim()) return;
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
    <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-card">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything… (Shift+Enter for a new line)"
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-100 disabled:opacity-50"
      />
      <Button type="submit" variant="primary" disabled={disabled || !value.trim()}>
        Send
      </Button>
    </form>
  );
}
