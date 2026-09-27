import { Icon } from './Icon';

/** Compact single-line empty state — an inline icon beside the text, no icon backdrop or stacked
 * padding, so a card with nothing in it yet reads as one calm line, not a padded box. */
export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex items-center gap-1.5 py-1 text-left text-sm">
      <Icon name="inbox" className="h-3.5 w-3.5 shrink-0 text-faint" />
      <p className="min-w-0 truncate text-fg-2">
        {title}
        {description && <span className="ml-1.5 text-xs text-muted">{description}</span>}
      </p>
    </div>
  );
}
