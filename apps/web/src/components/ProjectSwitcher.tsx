import { useRef, useState } from 'react';
import type { Project } from '@opex/shared';
import { Icon } from './ui/Icon';
import { useDismiss } from '../lib/useDismiss';

/** Compact project chip with a dropdown; shows what "space" you are in on every page that depends on it. */
export function ProjectSwitcher({ projects, value, onChange }: { projects: Project[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const current = projects.find((p) => p.id === value);
  const many = projects.length > 1;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => many && setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={many ? 'Switch project' : 'Your project'}
        className={`inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-fg ${many ? 'hover:border-accent-300' : 'cursor-default'}`}
      >
        <span className="grid h-5 w-5 place-items-center rounded-md bg-accent-100 text-[11px] font-semibold text-accent-700" aria-hidden="true">
          {(current?.name ?? '?').slice(0, 1).toUpperCase()}
        </span>
        <span className="max-w-[12rem] truncate">{current?.name ?? 'No project'}</span>
        {many && <Icon name="arrowDown" className="h-3.5 w-3.5 text-muted" />}
      </button>
      {open && (
        <ul role="listbox" className="absolute left-0 top-full z-20 mt-1 max-h-72 min-w-[14rem] overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-lg">
          {projects.map((p) => (
            <li key={p.id} role="option" aria-selected={p.id === value}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onChange(p.id);
                }}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-raised ${p.id === value ? 'bg-accent-50 font-medium text-accent-700' : 'text-fg-2'}`}
              >
                {p.id === value && <Icon name="check" className="h-4 w-4" />}
                <span className="truncate">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
