import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:brightness-110 disabled:hover:brightness-100',
  secondary: 'bg-surface text-ink border border-border hover:bg-canvas',
  ghost: 'text-ink-muted hover:bg-canvas hover:text-ink',
  danger: 'bg-danger-soft text-danger hover:brightness-95',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      // Mientras vuela una mutación el botón se deshabilita y muestra el
      // spinner ahí mismo: el usuario ve dónde está pasando algo, en vez de
      // que un overlay tape la pantalla entera.
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-medium transition
        disabled:cursor-not-allowed disabled:opacity-60
        ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
