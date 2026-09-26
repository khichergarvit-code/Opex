import type { ReactNode } from 'react';

export type PillTone = 'success' | 'danger' | 'warning' | 'neutral' | 'info' | 'active';

const TONE_CLASSES: Record<PillTone, string> = {
  success: 'bg-success-50 text-success-700',
  danger: 'bg-danger-50 text-danger-700',
  warning: 'bg-warning-50 text-warning-700',
  neutral: 'bg-raised text-fg-2',
  info: 'bg-accent-100 text-accent-700',
  // Outlined with a dot: reads as "on" without competing with the green-ish accent colour.
  active: 'border border-line bg-transparent text-fg-2',
};

export function StatusPill({ tone, children, title }: { tone: PillTone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {tone === 'active' && <span aria-hidden="true" className="mr-1.5 h-1.5 w-1.5 rounded-full bg-fg-2" />}
      {children}
    </span>
  );
}
