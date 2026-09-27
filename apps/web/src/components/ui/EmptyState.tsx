import { Icon } from './Icon';

/** Compact single-row empty state — an icon beside the text, not stacked with large padding, so a card with
 * nothing in it yet reads as one calm line instead of a tall mostly-empty box. */
export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-2 text-left">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-600">
        <Icon name="inbox" className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg-2">{title}</p>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
    </div>
  );
}
