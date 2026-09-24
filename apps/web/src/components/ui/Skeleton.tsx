/** Shimmering placeholder shown while data loads (replaces bare "Loading…" text). */
export function Skeleton({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-4 rounded-full" style={{ width: `${92 - i * 14}%` }} />
      ))}
    </div>
  );
}
