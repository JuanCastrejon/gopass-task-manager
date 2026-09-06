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

/**
 * `pointer-coarse:` eleva la altura a 44 px (`h-11`) solo donde el puntero es
 * un dedo. WCAG 2.2 SC 2.5.8 pide 24x24 como mínimo —que ya se cumplía— pero
 * SC 2.5.5 y las guías de Apple piden 44x44, y medido en un móvil de 390 px
 * los controles de la tarjeta quedaban en 28x32: legales y difíciles de
 * acertar con el pulgar. En ratón se mantienen compactos: agrandarlos allí
 * solo emborronaría la densidad de la interfaz.
 */
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5 pointer-coarse:h-11',
  md: 'h-9 px-3.5 text-sm gap-2 pointer-coarse:h-11',
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
      // `touch-manipulation` quita el retardo de ~300 ms que el navegador
      // reserva para detectar un doble toque. `active:scale` da la respuesta
      // inmediata que en escritorio da el `hover` y en táctil no existe.
      className={`inline-flex shrink-0 touch-manipulation items-center justify-center whitespace-nowrap
        rounded-lg font-medium transition active:scale-[0.97]
        disabled:cursor-not-allowed disabled:opacity-60
        ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
