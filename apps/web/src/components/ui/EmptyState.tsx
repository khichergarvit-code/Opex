import { Icon } from './Icon';

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-accent-100 text-accent-600">
        <Icon name="inbox" className="h-6 w-6" />
      </span>
      <p className="text-sm font-medium text-fg-2">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs text-muted">{description}</p>}
    </div>
  );
}
