import type { HTMLAttributes } from 'react';

export function Card({ className = '', padded = true, ...props }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-gray-100 bg-white shadow-card ${padded ? 'p-5' : ''} ${className}`}
      {...props}
    />
  );
}
