import { useQuery } from '@tanstack/react-query';
import { Activity, CircleAlert, Database, Loader2 } from 'lucide-react';
import { api } from './lib/api-client.ts';

interface Health {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  uptime: number;
}

/**
 * D1-1. Esta vista existe para demostrar que el cableado completo funciona:
 * navegador → proxy → Express → PostgreSQL. Se reemplaza por el panel de
 * proyectos en D1-4.
 */
export function App() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<Health>('/health'),
    refetchInterval: 5000,
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-5 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">GoPass Task Manager</h1>
        <p className="text-sm text-ink-muted">
          Gestión de tareas por proyectos · React 18 · Express · PostgreSQL
        </p>
      </header>

      <section
        aria-live="polite"
        className="rounded-xl border border-border bg-surface p-5 shadow-sm"
      >
        <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-ink-muted">
          <Activity className="size-4" aria-hidden />
          Estado del sistema
        </h2>

        {health.isPending && (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Consultando la API…
          </p>
        )}

        {health.isError && (
          <div className="flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">No hay conexión con la API</p>
              <p className="mt-0.5 opacity-90">{health.error.message}</p>
            </div>
          </div>
        )}

        {health.data && (
          <dl className="grid gap-3 sm:grid-cols-3">
            <Stat label="API" value={health.data.status === 'ok' ? 'operativa' : 'degradada'} ok={health.data.status === 'ok'} />
            <Stat
              label="PostgreSQL"
              value={health.data.database === 'up' ? 'conectada' : 'sin conexión'}
              ok={health.data.database === 'up'}
              icon={<Database className="size-3.5" aria-hidden />}
            />
            <Stat label="Uptime" value={`${health.data.uptime}s`} ok />
          </dl>
        )}
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  ok,
  icon,
}: {
  label: string;
  value: string;
  ok: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-ink-muted">
        {icon}
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm font-medium ${ok ? 'text-status-done' : 'text-danger'}`}
      >
        {value}
      </dd>
    </div>
  );
}
