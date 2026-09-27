/**
 * The OpeX mark: a rounded tile holding an "X" whose upper-right stroke ends in a small node —
 * two data paths crossing at one trusted point. A flat fill, not a gradient: a `<linearGradient>`
 * needs an id, and this mark renders more than once at a time (desktop sidebar + `md:hidden` mobile
 * header both sit in the DOM together) — two elements sharing one gradient id is invalid and made the
 * tile randomly fail to paint, leaving only the white X floating with no backdrop. Pure SVG, so it
 * works offline and scales crisply.
 */
export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="OpeX" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="13" fill="#171717" />
      <path d="M15 15l18 18M15 33l11.2-11.2" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" fill="none" />
      <circle cx="33" cy="15" r="4" fill="#fff" />
    </svg>
  );
}

export function Logo({ className = '', markClassName = 'h-9 w-9', textClassName = 'text-xl' }: { className?: string; markClassName?: string; textClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={markClassName} />
      <span className={`${textClassName} font-semibold tracking-tight text-fg`}>OpeX</span>
    </span>
  );
}
