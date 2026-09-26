import type { ReactNode } from 'react';

export function SidebarSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      {label && <p className="mb-1 px-3 pt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-faint">{label}</p>}
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

export function SidebarNavItem({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 ${
        active ? 'bg-raised font-medium text-fg before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-ember-500' : 'text-fg-2 hover:bg-raised/70'
      }`}
    >
      {icon && <span className="flex shrink-0 items-center justify-center">{icon}</span>}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function SidebarNav({ children }: { children: ReactNode }) {
  return <nav className="flex flex-1 flex-col overflow-y-auto px-2 py-2">{children}</nav>;
}
