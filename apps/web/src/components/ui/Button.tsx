import type { ButtonHTMLAttributes } from 'react';
import { ripple } from '../../lib/ripple';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

// Material 3: filled (primary), tonal (secondary), text (ghost), and a filled error button.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent-500 text-on-accent shadow-card hover:bg-accent-600 hover:shadow-lift disabled:bg-accent-500/35 disabled:shadow-none',
  secondary: 'bg-accent-100 text-accent-700 hover:bg-accent-200 disabled:opacity-50',
  ghost: 'bg-transparent text-accent-500 hover:bg-accent-50 disabled:opacity-50',
  danger: 'bg-danger-600 text-on-accent shadow-card hover:bg-danger-700 disabled:bg-danger-600/35 disabled:shadow-none',
};

const SIZE_CLASSES = {
  sm: 'px-4 py-1.5 text-sm',
  md: 'px-6 py-2.5 text-sm',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  onPointerDown,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
}) {
  return (
    <button
      disabled={disabled || loading}
      onPointerDown={(e) => {
        if (!(disabled || loading)) ripple(e);
        onPointerDown?.(e);
      }}
      className={`relative inline-flex select-none items-center justify-center gap-2 overflow-hidden rounded-full font-medium tracking-[0.01em] transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.97] disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
