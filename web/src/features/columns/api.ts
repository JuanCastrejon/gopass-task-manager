import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';
import { projectKeys, statsKey } from '../projects/api.ts';
import { taskKeys } from '../tasks/api.ts';
import type {
  CreateColumnInput,
  PatchColumnInput,
  ProjectColumn,
  ProjectColumnSummary,
} from '../../types/api.ts';

export const columnKeys = {
  all: ['columns'] as const,
  byProject: (projectId: string) => [...columnKeys.all, projectId] as const,
};

export function useColumns(projectId: string) {
  return useQuery({
    queryKey: columnKeys.byProject(projectId),
    queryFn: () => api.get<ProjectColumnSummary[]>(`/projects/${projectId}/columns`),
  });
}

/**
 * Cualquier cambio en las columnas afecta al tablero entero.
 *
 * Se invalidan también las tareas y el proyecto: renombrar no las mueve, pero
 * reordenar cambia el orden en que llegan —el `ORDER BY` es por posición de
 * columna— y borrar reasignando cambia el estado de las que se movieron, lo
 * que a su vez mueve el avance del proyecto y los agregados del panel.
 */
function useInvalidateAfterColumnChange(projectId: string) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: columnKeys.byProject(projectId) });
    void client.invalidateQueries({ queryKey: taskKeys.all });
    void client.invalidateQueries({ queryKey: projectKeys.all });
    void client.invalidateQueries({ queryKey: statsKey });
  };
}

export function useCreateColumn(projectId: string) {
  const invalidate = useInvalidateAfterColumnChange(projectId);
  return useMutation({
    mutationFn: (input: CreateColumnInput) =>
      api.post<ProjectColumn>(`/projects/${projectId}/columns`, input),
    onSuccess: invalidate,
  });
}

export function useUpdateColumn(projectId: string) {
  const invalidate = useInvalidateAfterColumnChange(projectId);
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PatchColumnInput }) =>
      api.patch<ProjectColumn>(`/projects/${projectId}/columns/${id}`, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteColumn(projectId: string) {
  const invalidate = useInvalidateAfterColumnChange(projectId);
  return useMutation({
    // `reassignTo` va como parámetro de consulta y no en el cuerpo: un DELETE
    // con cuerpo es legal pero lo descartan proxies y clientes con demasiada
    // frecuencia como para depender de él.
    mutationFn: ({ id, reassignTo }: { id: string; reassignTo?: string }) =>
      api.delete(
        `/projects/${projectId}/columns/${id}${reassignTo ? `?reassignTo=${reassignTo}` : ''}`,
      ),
    onSuccess: invalidate,
  });
}

export function useReorderColumns(projectId: string) {
  const invalidate = useInvalidateAfterColumnChange(projectId);
  return useMutation({
    mutationFn: (columnIds: string[]) =>
      api.patch<ProjectColumnSummary[]>(`/projects/${projectId}/columns/reorder`, { columnIds }),
    onSuccess: invalidate,
  });
}
