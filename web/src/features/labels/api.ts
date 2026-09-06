import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';
import { taskKeys } from '../tasks/api.ts';
import type {
  CreateLabelInput,
  Label,
  PatchLabelInput,
  Task,
} from '../../types/api.ts';

export const labelKeys = {
  all: ['labels'] as const,
  byProject: (projectId: string) => [...labelKeys.all, 'byProject', projectId] as const,
};

/**
 * Consulta las etiquetas del proyecto con su conteo de tareas asociadas.
 */
export function useLabels(projectId: string) {
  return useQuery({
    queryKey: labelKeys.byProject(projectId),
    queryFn: () => api.get<Label[]>(`/projects/${projectId}/labels`),
    enabled: Boolean(projectId),
  });
}

/**
 * Al alterar etiquetas (crear, renombrar, cambiar color o borrar), se invalidan
 * las etiquetas del proyecto y las tareas, ya que cada tarjeta renderiza sus etiquetas embebidas.
 */
function useInvalidateAfterLabelChange(projectId: string) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: labelKeys.byProject(projectId) });
    void client.invalidateQueries({ queryKey: taskKeys.all });
  };
}

export function useCreateLabel(projectId: string) {
  const invalidate = useInvalidateAfterLabelChange(projectId);
  return useMutation({
    mutationFn: (input: CreateLabelInput) =>
      api.post<Label>(`/projects/${projectId}/labels`, input),
    onSuccess: invalidate,
  });
}

export function useUpdateLabel(projectId: string) {
  const invalidate = useInvalidateAfterLabelChange(projectId);
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PatchLabelInput }) =>
      api.patch<Label>(`/labels/${id}`, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteLabel(projectId: string) {
  const invalidate = useInvalidateAfterLabelChange(projectId);
  return useMutation({
    mutationFn: ({ id, confirm }: { id: string; confirm?: boolean }) =>
      api.delete(`/labels/${id}${confirm ? '?confirm=true' : ''}`),
    onSuccess: invalidate,
  });
}

/**
 * Asigna atómicamente el conjunto de etiquetas de una tarea mediante PUT idempotente.
 */
export function useSetTaskLabels() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, labelIds }: { taskId: string; labelIds: string[] }) =>
      api.put<Task>(`/tasks/${taskId}/labels`, { labelIds }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: taskKeys.all });
      void client.invalidateQueries({ queryKey: labelKeys.all });
    },
  });
}
