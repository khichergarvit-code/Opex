import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from './ui/Icon';

/**
 * Docked in place of the main composer while a turn is streaming: lets you type and queue one
 * follow-up (sent automatically the moment the current answer finishes), shows what's in scope
 * for this turn, and stops the run. Only one message can be queued — sending again replaces it.
 */
export function FollowupBar({
  contextLabel,
  modelLabel,
  queued,
  onQueue,
  onStop,
}: {
  contextLabel: string;
  modelLabel: string;
  queued: string;
  onQueue: (text: string) => void;
  onStop: () => void;
}) {
  const [value, setValue] = useState('');

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!value.trim()) return;
    onQueue(value.trim());
    setValue('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') submit();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-[28px] border border-line bg-surface px-4 pb-3 pt-3 shadow-card">
      {queued && (
        <p className="flex items-center gap-1.5 truncate rounded-full bg-accent-50 px-3 py-1 text-xs text-accent-700">
          <Icon name="check" className="h-3 w-3 shrink-0" />
          Queued — sends the moment this answer finishes: "{queued}"
        </p>
      )}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask a follow-up while I work…"
        className="w-full bg-transparent px-1 py-1 text-[15px] outline-none placeholder:text-faint"
      />
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-line bg-canvas px-3 py-1 text-xs text-fg-2">{contextLabel}</span>
        <span className="rounded-full border border-line bg-canvas px-3 py-1 text-xs text-fg-2">{modelLabel}</span>
        <span className="ml-auto text-xs text-faint">Esc to stop</span>
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop"
          className="grid h-10 w-10 place-items-center rounded-full bg-danger-600 text-white transition-transform hover:scale-105 active:scale-95"
        >
          <Icon name="stop" className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
