import { QueryClient } from '@tanstack/react-query';

/**
 * Estado de servidor con TanStack Query (ADR-005).
 *
 * Sin actualizaciones optimistas: tras cada mutación se invalida la query
 * afectada. La interfaz nunca muestra un estado que PostgreSQL rechazó.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      // Un 4xx es una respuesta, no un fallo de red: reintentarlo solo
      // retrasa el mensaje de error que el usuario necesita ver.
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status;
        if (status !== undefined && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});
