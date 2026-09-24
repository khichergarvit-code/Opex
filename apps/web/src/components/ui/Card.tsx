import type { HTMLAttributes } from 'react';

/** Tonal container: elevation comes from the surface colour, with a hairline for definition. */
export function Card({ className = '', padded = true, ...props }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return (
    <div
      className={`rounded-3xl border border-line/50 bg-surface shadow-card ${padded ? 'p-5' : ''} ${className}`}
      {...props}
    />
  );
}
