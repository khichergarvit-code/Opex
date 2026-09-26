import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

// Material 3: filled (primary), tonal (secondary), text (ghost), and a filled error button.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent-500 text-on-accent hover:bg-accent-600 disabled:opacity-40',
  secondary: 'border border-line bg-surface text-fg hover:bg-raised disabled:opacity-50',
  ghost: 'bg-transparent text-fg-2 hover:bg-raised disabled:opacity-50',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 disabled:opacity-40',
};

const SIZE_CLASSES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
}) {
  return (
    <button
      disabled={disabled || loading}
      className={`relative inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 active:translate-y-px disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
