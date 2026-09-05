import { CheckCircle2, FolderKanban, ListTodo, TrendingUp } from 'lucide-react';
import { useStats } from '../projects/api.ts';
import { ProgressBar } from '../../components/ui/ProgressBar.tsx';
import { Skeleton } from '../../components/ui/States.tsx';
import type { TaskStatus } from '../../types/api.ts';

const ETIQUETA: Record<TaskStatus, string> = {
  TODO: 'Por hacer',
  IN_PROGRESS: 'En curso',
  DONE: 'Completadas',
};

const COLOR: Record<TaskStatus, string> = {
  TODO: 'bg-status-todo',
  IN_PROGRESS: 'bg-status-progress',
  DONE: 'bg-status-done',
};

const ORDEN: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];

/**
 * Responde a "visualizar esa información de forma útil": no lista filas, sino
 * que contesta cuánto trabajo hay, cuánto está hecho y dónde está atascado.
 *
 * El endpoint `/api/stats` agrega en la base de un viaje. La alternativa
 * —descargar todo y contar en JavaScript— no escala y además obligaría a
 * traerse las tareas de todos los proyectos solo para pintar cuatro números.
 */
export function StatsPanel() {
  const { data, isPending, isError } = useStats();

  // Un error NO puede quedarse en el esqueleto: parpadearía indefinidamente y
  // parecería una carga colgada en vez de un fallo. El panel es información
  // complementaria, así que se retira y la vista sigue siendo usable; el error
  // de la lista de proyectos, que sí es el contenido principal, ya se muestra.
  if (isError) {
    return (
      <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ink-muted">
        No se pudieron cargar las métricas.
      </p>
    );
  }

  // El esqueleto ocupa exactamente el mismo alto que el panel resuelto, así
  // que la página no da un salto cuando llegan los datos.
  if (isPending) {
    return (
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy>
        {ORDEN.concat('TODO').map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2.5 h-6 w-12" />
          </div>
        ))}
      </section>
    );
  }

  const total = Math.max(1, data.tasks);

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta icono={<FolderKanban className="size-4" aria-hidden />} etiqueta="Proyectos" valor={data.projects} />
        <Tarjeta icono={<ListTodo className="size-4" aria-hidden />} etiqueta="Tareas" valor={data.tasks} />
        <Tarjeta icono={<CheckCircle2 className="size-4" aria-hidden />} etiqueta="Completadas" valor={data.done} />
        <Tarjeta icono={<TrendingUp className="size-4" aria-hidden />} etiqueta="Avance global" valor={`${data.progress}%`}>
          <ProgressBar value={data.progress} label="Avance global" />
        </Tarjeta>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
          Tareas por estado
        </h2>
        {data.tasks === 0 ? (
          <p className="text-sm text-ink-muted">Todavía no hay tareas registradas.</p>
        ) : (
          <ul className="space-y-2.5">
            {ORDEN.map((estado) => {
              const n = data.byStatus[estado];
              return (
                <li key={estado} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-ink-muted">{ETIQUETA[estado]}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
                    <span
                      className={`block h-full rounded-full ${COLOR[estado]}`}
                      style={{ width: `${(n / total) * 100}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right font-medium tabular-nums">{n}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function Tarjeta({
  icono,
  etiqueta,
  valor,
  children,
}: {
  icono: React.ReactNode;
  etiqueta: string;
  valor: number | string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-ink-muted">
        {icono}
        {etiqueta}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums">{valor}</div>
      {children && <div className="mt-2.5">{children}</div>}
    </div>
  );
}
