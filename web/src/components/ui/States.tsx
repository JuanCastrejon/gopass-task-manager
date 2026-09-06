import type { ReactNode } from 'react';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { Button } from './Button.tsx';

/**
 * Los tres estados feos (RNF-07). Están en un solo archivo porque siempre se
 * usan juntos: cada vista que pide datos necesita las tres.
 */

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ink-muted">{icon}</div>}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-danger/20 bg-danger-soft p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2.5 text-sm text-danger">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{message}</span>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden />
          Reintentar
        </Button>
      )}
    </div>
  );
}

/**
 * Esqueleto con la forma de lo que va a llegar, no un spinner centrado. En el
 * primer render dibuja la retícula de inmediato, así que no hay salto de
 * maquetación cuando entran los datos.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-border/70 ${className}`} aria-hidden />;
}

export function ProjectCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <div className="mt-auto space-y-2 pt-3">
        <Skeleton className="h-2 w-24" />
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
    </div>
  );
}
