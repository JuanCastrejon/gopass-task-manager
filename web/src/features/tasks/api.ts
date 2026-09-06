import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';
import { columnKeys } from '../columns/api.ts';
import { projectKeys, statsKey } from '../projects/api.ts';
import type { Task, TaskPriority, TaskStatus } from '../../types/api.ts';

export interface TaskFilters {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  q?: string;
}

export const taskKeys = {
  all: ['tasks'] as const,
  byProject: (projectId: string, filters: TaskFilters = {}) =>
    [...taskKeys.all, 'byProject', projectId, filters] as const,
};

function toQueryString(filters: TaskFilters): string {
  const params = new URLSearchParams();
  // Repetir el parámetro es lo que espera la API: ?status=TODO&status=DONE
  filters.status?.forEach((s) => params.append('status', s));
  filters.priority?.forEach((p) => params.append('priority', p));
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useTasks(projectId: string, filters: TaskFilters = {}) {
  return useQuery({
    queryKey: taskKeys.byProject(projectId, filters),
    queryFn: () => api.get<Task[]>(`/projects/${projectId}/tasks${toQueryString(filters)}`),
    // Al cambiar un filtro, conserva en pantalla el resultado anterior
    // mientras llega el nuevo: sin esto el tablero parpadearía a esqueleto en
    // cada tecla del buscador.
    placeholderData: (previous) => previous,
  });
}

/**
 * Cualquier cambio en una tarea mueve el avance del proyecto, los agregados del
 * panel y **el recuento de las columnas**, así que se invalidan las cuatro
 * familias de claves.
 *
 * Lo de las columnas se olvidó al principio y lo cazó un E2E: el diálogo de
 * gestión seguía diciendo «0 tareas» en una columna recién llenada, y ofrecía
 * borrarla sin preguntar a dónde iban.
 */
function useInvalidateAfterTaskChange() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: taskKeys.all });
    void client.invalidateQueries({ queryKey: columnKeys.all });
    void client.invalidateQueries({ queryKey: projectKeys.all });
    void client.invalidateQueries({ queryKey: statsKey });
  };
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  /** Gana sobre `status`: solo el identificador distingue entre columnas de la misma categoría. */
  columnId?: string;
  priority?: TaskPriority;
}

export interface PatchTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  /** Gana sobre `status`. Ver la nota de `CreateTaskInput`. */
  columnId?: string;
  priority?: TaskPriority;
}

export function useCreateTask(projectId: string) {
  const invalidate = useInvalidateAfterTaskChange();
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      api.post<Task>(`/projects/${projectId}/tasks`, input),
    onSuccess: invalidate,
  });
}

/**
 * Matiz de ADR-005, no excepción.
 *
 * ADR-005 prohíbe las actualizaciones **optimistas**: pintar un estado antes
 * de que la base lo confirme. Eso sigue en pie: no hay `onMutate`, ni rollback
 * que mantener.
 *
 * Lo que se hace aquí es distinto. En `onSuccess` PostgreSQL **ya respondió
 * 200 con la tarea actualizada**, así que escribir esa respuesta en la caché
 * no es optimismo: es aplicar el dato confirmado sin pagar un segundo viaje.
 * La tarjeta salta de columna en el instante en que llega la respuesta, en vez
 * de quedarse quieta durante el refetch.
 *
 * Se invalida igualmente `taskKeys`: si el parche cambió la prioridad y hay un
 * filtro por prioridad activo, la lista escrita a mano podría contener una
 * tarea que ya no casa. La invalidación corrige eso en segundo plano sin que
 * el usuario vea el hueco.
 */
export function useUpdateTask() {
  const client = useQueryClient();
  const invalidate = useInvalidateAfterTaskChange();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PatchTaskInput }) =>
      api.patch<Task>(`/tasks/${id}`, patch),
    onSuccess: (actualizada) => {
      client.setQueriesData<Task[]>({ queryKey: taskKeys.all }, (previas) =>
        previas?.map((t) => (t.id === actualizada.id ? actualizada : t)),
      );
      invalidate();
    },
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateAfterTaskChange();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: invalidate,
  });
}
