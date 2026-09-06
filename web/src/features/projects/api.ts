import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';
import type {
  CreateProjectInput,
  PatchProjectInput,
  Project,
  ProjectSummary,
  Stats,
} from '../../types/api.ts';

/**
 * Factoría de claves. Con cuatro endpoints ya paga: la invalidación tras una
 * mutación deja de depender de strings repetidos a mano, y un cambio en la
 * jerarquía se hace en un sitio.
 */
export const projectKeys = {
  all: ['projects'] as const,
  list: () => [...projectKeys.all, 'list'] as const,
  detail: (id: string) => [...projectKeys.all, 'detail', id] as const,
};

export const statsKey = ['stats'] as const;

/** Toda mutación de proyecto cambia también los agregados del panel. */
function useInvalidateProjects() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: projectKeys.all });
    void client.invalidateQueries({ queryKey: statsKey });
  };
}

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.list(),
    queryFn: () => api.get<ProjectSummary[]>('/projects'),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => api.get<ProjectSummary>(`/projects/${id}`),
  });
}

export function useStats() {
  return useQuery({ queryKey: statsKey, queryFn: () => api.get<Stats>('/stats') });
}

export function useCreateProject() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => api.post<Project>('/projects', input),
    onSuccess: invalidate,
  });
}

export function useUpdateProject(id: string) {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (input: PatchProjectInput) => api.patch<Project>(`/projects/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteProject() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${id}`),
    onSuccess: invalidate,
  });
}
