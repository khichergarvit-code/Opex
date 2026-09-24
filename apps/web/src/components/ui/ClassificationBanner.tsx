import type { Classification } from '@opex/shared';

const LEVEL_LABEL: Record<Classification, string> = {
  0: 'Public',
  1: 'Internal',
  2: 'Confidential',
  3: 'Restricted',
};

const LEVEL_CLASSES: Record<Classification, string> = {
  0: 'bg-raised text-fg-2',
  1: 'bg-accent-50 text-accent-700',
  2: 'bg-warning-50 text-warning-700',
  3: 'bg-danger-50 text-danger-700',
};

/** ui.md: "A banner shows the highest classification currently on screen." Always fed a real, computed level — never hardcoded. */
export function ClassificationBanner({ level }: { level: Classification }) {
  return (
    <div className={`sticky top-0 z-10 px-4 py-1.5 text-center text-xs font-medium tracking-wide ${LEVEL_CLASSES[level]}`}>
      {LEVEL_LABEL[level]}
    </div>
  );
}
