import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { Icon } from './Icon';

/** One look for every text box, so forms are consistent across the admin area. */
export const inputClass =
  'w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-fg outline-none transition-colors placeholder:text-faint hover:border-accent-300 focus:border-accent-400 focus-visible:ring-2 focus-visible:ring-accent-200';

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 text-sm font-medium text-fg-2 ${className}`}>
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

export function TextField({ label, hint, className, ...props }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} className={className}>
      <input {...props} className={inputClass} />
    </Field>
  );
}

export function SelectField({ label, hint, className, children, ...props }: { label: string; hint?: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint} className={className}>
      <span className="relative block">
        <select {...props} className={`${inputClass} appearance-none pr-9`}>
          {children}
        </select>
        <Icon name="arrowDown" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </span>
    </Field>
  );
}

/** Checkbox in the design system's style (accent fill, rounded), used instead of the browser default. */
export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-fg-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="grid h-5 w-5 place-items-center rounded-md border border-line bg-canvas text-transparent transition-colors peer-checked:border-accent-500 peer-checked:bg-accent-500 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent-200"
      >
        <Icon name="check" className="h-3.5 w-3.5" />
      </span>
      {label}
    </label>
  );
}
