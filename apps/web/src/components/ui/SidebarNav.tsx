import type { ReactNode } from 'react';
import { ripple } from '../../lib/ripple';

export function SidebarSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      {label && <p className="mb-1 px-4 pt-2 text-xs font-medium tracking-wide text-faint">{label}</p>}
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
      onPointerDown={ripple}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center gap-3 overflow-hidden rounded-full px-4 py-2.5 text-left text-sm transition-colors duration-200 ${
        active ? 'bg-accent-100 font-medium text-accent-700' : 'text-fg-2 hover:bg-raised/70'
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
