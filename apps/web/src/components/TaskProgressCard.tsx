import { Icon } from './ui/Icon';

export interface TaskStep {
  id: string;
  label: string;
  kind: string;
  state: 'queued' | 'running' | 'done' | 'failed';
  detail?: string;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function StateIcon({ state }: { state: TaskStep['state'] }) {
  if (state === 'done') {
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-fg text-canvas" aria-label="Done">
        <Icon name="check" className="h-3 w-3" />
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-danger-600 text-white" aria-label="Failed">
        <Icon name="close" className="h-3 w-3" />
      </span>
    );
  }
  if (state === 'running') {
    return <span className="h-5 w-5 animate-spin rounded-full border-2 border-ember-500 border-t-transparent" aria-label="In progress" />;
  }
  return <span className="h-5 w-5 rounded-full border-2 border-dashed border-line" aria-label="Queued" />;
}

/**
 * Live card for multi-item work (e.g. summarising several documents): counts, elapsed time and ETA, one row per item,
 * and the two controls that matter: let it continue in the background, or stop it.
 */
export function TaskProgressCard({
  title,
  items,
  elapsedMs,
  onStop,
  onBackground,
}: {
  title: string;
  items: TaskStep[];
  elapsedMs: number;
  onStop: () => void;
  onBackground: () => void;
}) {
  const finished = items.filter((i) => i.state === 'done' || i.state === 'failed').length;
  const remaining = items.length - finished;
  const etaMs = finished > 0 ? (elapsedMs / finished) * remaining : null;
  const pct = items.length ? Math.round((finished / items.length) * 100) : 0;

  return (
    <div className="w-full rounded-xl border border-line bg-surface" role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-4 px-4 pt-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">
            {title} · {finished} of {items.length} done
          </p>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-faint">Local model · your documents</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-lg tabular-nums text-fg">{clock(elapsedMs)}</p>
          {etaMs !== null && remaining > 0 && <p className="text-xs text-muted">~{Math.max(1, Math.round(etaMs / 1000))}s left</p>}
        </div>
      </div>

      <div className="mx-4 mt-3 h-1 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-ember-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>

      <ul className="mt-2 divide-y divide-line/60">
        {items.map((i) => (
          <li key={i.id} className={`flex items-center gap-3 px-4 py-2.5 ${i.state === 'queued' ? 'text-faint' : 'text-fg'}`}>
            <StateIcon state={i.state} />
            <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">{i.kind}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{i.label}</span>
            <span className={`shrink-0 text-xs ${i.state === 'failed' ? 'text-danger-700' : i.state === 'running' ? 'text-ember-600' : 'text-muted'}`}>{i.detail}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
        <p className="text-xs text-muted">Summaries appear below as each document finishes.</p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onBackground} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-fg hover:bg-raised">
            Run in background
          </button>
          <button type="button" onClick={onStop} className="rounded-lg border border-danger-600/40 px-3 py-1.5 text-xs font-medium text-danger-700 hover:bg-danger-50">
            Stop
          </button>
        </div>
      </div>
    </div>
  );
}
