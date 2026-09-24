import type { ReactNode } from 'react';

export type PillTone = 'success' | 'danger' | 'warning' | 'neutral' | 'info';

const TONE_CLASSES: Record<PillTone, string> = {
  success: 'bg-success-50 text-success-700',
  danger: 'bg-danger-50 text-danger-700',
  warning: 'bg-warning-50 text-warning-700',
  neutral: 'bg-raised text-fg-2',
  info: 'bg-accent-100 text-accent-700',
};

export function StatusPill({ tone, children, title }: { tone: PillTone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
