import { useState, type FormEvent } from 'react';
import { Button } from './ui/Button';

export function Composer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (content: string) => void;
}) {
  const [value, setValue] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    onSend(value);
    setValue('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-card">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask anything…"
        disabled={disabled}
        className="flex-1 rounded-xl px-3 py-2 text-sm outline-none disabled:opacity-50"
      />
      <Button type="submit" variant="primary" disabled={disabled || !value.trim()}>
        Send
      </Button>
    </form>
  );
}
