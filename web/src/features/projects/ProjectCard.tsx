import { useState, type MouseEvent } from 'react';
import { ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { Link } from '../../lib/router.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { PriorityBadge } from '../../components/ui/Badge.tsx';
import { ProgressBar } from '../../components/ui/ProgressBar.tsx';
import { ProjectFormDialog } from './ProjectFormDialog.tsx';
import { DeleteProjectDialog } from './DeleteProjectDialog.tsx';
import type { ProjectSummary } from '../../types/api.ts';

/**
 * Seleccionar texto y soltar dispara un `click` en el enlace que envuelve la
 * tarjeta, así que copiar una descripción acabaría navegando. Si al soltar
 * queda una selección viva, se cancela la navegación: `Link` respeta
 * `defaultPrevented` y no llama a `navigate`.
 */
function noNavegarTrasSeleccionar(event: MouseEvent<HTMLAnchorElement>): void {
  if (!window.getSelection()?.isCollapsed) event.preventDefault();
}

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const [editando, setEditando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  return (
    /**
     * La tarjeta entera navega, y lo hace con **un enlace real que envuelve el
     * contenido**, no con un `onClick` sobre el `<article>` ni con un
     * pseudo-elemento estirado por encima.
     *
     * Se midió contra las dos alternativas. Con el pseudo-elemento
     * (`::after` en `inset: 0`), `elementFromPoint` sobre la descripción
     * devuelve el propio enlace: el texto nunca recibe el puntero y **no se
     * puede seleccionar**. Subir el párrafo por encima del overlay lo arregla
     * a medias y rompe otra cosa: esa franja deja de navegar, y la tarjeta
     * queda con un rectángulo inerte en el centro. Comprobado en el navegador.
     *
     * Con el enlace envolvente, el texto sí recibe el puntero y el clic sigue
     * navegando, porque el párrafo está **dentro** del área navegable.
     *
     * `group` y no `:hover` sobre el enlace: el realce debe responder al ratón
     * en cualquier punto de la tarjeta, incluidos los botones.
     */
    <article className="group relative flex flex-col rounded-xl border border-border bg-surface transition hover:border-brand/40 hover:shadow-md">
      {/* Hermanos del enlace, nunca descendientes: un `<a>` no puede contener
          botones —es contenido interactivo anidado— y un lector de pantalla
          anunciaría un solo enlace con toda la tarjeta dentro. */}
      <div className="absolute right-3 top-3 z-10 flex gap-0.5 pointer-coarse:gap-1">
        <Button variant="ghost" size="sm" onClick={() => setEditando(true)} aria-label={`Editar ${project.name}`}>
          <Pencil className="size-3.5" aria-hidden />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setBorrando(true)} aria-label={`Eliminar ${project.name}`}>
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>

      <Link
        to={`/projects/${project.id}`}
        // Sin esto, arrastrar sobre la descripción arrastra el enlace en vez de
        // seleccionar el texto: los `<a>` son arrastrables por defecto.
        draggable={false}
        onClick={noNavegarTrasSeleccionar}
        // El nombre accesible lo fija la etiqueta, no el contenido: sin ella el
        // lector leería título, descripción, avance y porcentaje como el
        // nombre de un enlace.
        aria-label={`Abrir tareas de ${project.name}`}
        className="flex flex-1 flex-col rounded-xl p-5 text-ink no-underline outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        {/* `pr-20` reserva el hueco de los dos botones, que flotan encima. */}
        <h3 className="min-w-0 truncate pr-20 text-sm font-semibold" title={project.name}>
          {project.name}
        </h3>

        {/* Altura mínima reservada aunque no haya descripción, para que la
            retícula no quede escalonada. */}
        <p className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-sm text-ink-muted">
          {project.description ?? 'Sin descripción'}
        </p>

        {/* Solo la prioridad alta, y solo si la hay.
            Aquí hubo un desglose de las tres prioridades, que existía para
            explicar por qué un chip de prioridad escondía la tarjeta. Retirado
            el chip, tres píldoras por tarjeta son composición, no decisión: en
            una rejilla de ocho proyectos son veinticuatro etiquetas compitiendo
            con la barra de avance. Lo que sí se decide de un vistazo en un
            catálogo es dónde hay trabajo urgente. */}
        {project.byPriority.HIGH > 0 && (
          <div className="mt-2.5">
            <PriorityBadge priority="HIGH" count={project.byPriority.HIGH} />
          </div>
        )}

        <div className="mt-auto space-y-1.5 pt-4">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-ink-muted">
              {project.taskCount === 0
                ? 'Sin tareas'
                : `${project.doneCount} de ${project.taskCount} completadas`}
            </span>
            <span className="font-medium tabular-nums">{project.progress}%</span>
          </div>
          <ProgressBar value={project.progress} label={`Avance de ${project.name}`} />
        </div>

        {/* Se conserva aunque la tarjeta entera sea pulsable: es la única
            afordancia visible de que aquí se entra, y en táctil no hay `hover`
            que lo insinúe. Es un `<span>` y no otro enlace: duplicar el destino
            añadiría una parada de tabulación que lleva al mismo sitio. */}
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand group-hover:underline">
          Ver tareas
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </Link>

      {/* Montados solo cuando se abren. Renderizarlos siempre metía dos
          `<dialog>` por tarjeta en el documento: con cuatro proyectos había
          nueve, todos con los mismos `id`, así que cada `<label htmlFor>`
          apuntaba al campo del primero y `aria-labelledby` anunciaba siempre
          el mismo título. */}
      {editando && (
        <ProjectFormDialog open onClose={() => setEditando(false)} project={project} />
      )}
      {borrando && (
        <DeleteProjectDialog open onClose={() => setBorrando(false)} project={project} />
      )}
    </article>
  );
}
