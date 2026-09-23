import type { ReactNode } from 'react';

export function SidebarSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      {label && <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>}
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
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        active ? 'bg-accent-50 font-medium text-accent-700' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function SidebarNav({ children }: { children: ReactNode }) {
  return <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-2">{children}</nav>;
}
