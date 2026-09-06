import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSummary } from '../../../types/api.ts';

/**
 * El filtrado del panel ocurre en el cliente, así que la prueba que vale es la
 * del componente: el predicado —nombre y condición existencial sobre las
 * prioridades de los hijos— no vive en ningún módulo aparte que se pueda
 * probar por su cuenta, y extraerlo solo para poder probarlo sería mover
 * código para satisfacer al test.
 *
 * Se simula `useProjects` y no `fetch`: lo que se ejercita es el filtrado y el
 * estado vacío, no el cliente HTTP, que ya cubren las pruebas de la API contra
 * PostgreSQL real.
 */

const proyecto = (
  name: string,
  byPriority: ProjectSummary['byPriority'],
): ProjectSummary => ({
  id: crypto.randomUUID(),
  name,
  description: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  taskCount: byPriority.LOW + byPriority.MEDIUM + byPriority.HIGH,
  doneCount: 0,
  byPriority,
  progress: 0,
});

const DATOS = [
  proyecto('Telepeaje', { LOW: 1, MEDIUM: 0, HIGH: 2 }),
  proyecto('Parqueaderos', { LOW: 0, MEDIUM: 3, HIGH: 0 }),
  proyecto('Conciliación', { LOW: 0, MEDIUM: 0, HIGH: 0 }),
];

vi.mock('../api.ts', () => ({
  useProjects: () => ({ data: DATOS, isPending: false, isError: false, isFetching: false }),
  useCreateProject: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateProject: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteProject: () => ({ mutate: vi.fn(), isPending: false }),
  projectKeys: { all: ['projects'], list: () => ['projects', 'list'] },
  statsKey: ['stats'],
}));

// El panel de estadísticas hace su propia consulta y no es lo que se prueba.
vi.mock('../../dashboard/StatsPanel.tsx', () => ({ StatsPanel: () => null }));

const { ProjectsPage } = await import('../ProjectsPage.tsx');

function pintar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProjectsPage />
    </QueryClientProvider>,
  );
}

/** Los nombres de proyecto visibles, en orden. */
const visibles = () =>
  screen.getAllByRole('article').map((a) => within(a).getByRole('heading').textContent);

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('ProjectsPage — filtros', () => {
  it('parte mostrando todos los proyectos', () => {
    pintar();
    expect(visibles()).toEqual(['Telepeaje', 'Parqueaderos', 'Conciliación']);
  });

  it('busca por nombre sin distinguir mayúsculas ni tildes escritas igual', async () => {
    const user = userEvent.setup();
    pintar();

    await user.type(screen.getByLabelText('Buscar proyectos por nombre'), 'PARQ');

    // Filtra al teclear, sin esperar a que la URL se ponga al día: el filtrado
    // es local y hacerlo esperar al retardo solo lo haría parecer lento.
    expect(visibles()).toEqual(['Parqueaderos']);
  });

  it('el chip de prioridad deja los proyectos que tienen al menos una tarea así', async () => {
    const user = userEvent.setup();
    pintar();

    await user.click(screen.getByRole('button', { name: 'Alta' }));

    // «Parqueaderos» tiene tareas, pero ninguna de prioridad alta; y
    // «Conciliación» no tiene ninguna. Ambos salen.
    expect(visibles()).toEqual(['Telepeaje']);
  });

  it('combina búsqueda y prioridad, y lo deja en la URL para poder compartirlo', async () => {
    const user = userEvent.setup();
    pintar();

    await user.click(screen.getByRole('button', { name: 'Media' }));
    await user.type(screen.getByLabelText('Buscar proyectos por nombre'), 'parque');

    // La lista ya está filtrada aunque la URL todavía no lo diga: ese desfase
    // es el diseño, no un fallo. El chip sí va directo, porque un clic no
    // necesita retardo.
    expect(visibles()).toEqual(['Parqueaderos']);
    expect(new URLSearchParams(window.location.search).get('priority')).toBe('MEDIUM');

    // La búsqueda llega a la URL cuando vence el retardo, y sin llevarse por
    // delante la prioridad ya escrita.
    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get('q')).toBe('parque');
      expect(params.get('priority')).toBe('MEDIUM');
    });
  });

  it('sin coincidencias no dice «crea el primero», que sería mentira', async () => {
    const user = userEvent.setup();
    pintar();

    await user.type(screen.getByLabelText('Buscar proyectos por nombre'), 'no existe');

    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.getByText('Ningún proyecto coincide')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Crear el primer proyecto/ })).toBeNull();
  });

  it('«Limpiar filtros» devuelve la lista entera', async () => {
    const user = userEvent.setup();
    pintar();

    await user.click(screen.getByRole('button', { name: 'Alta' }));
    await user.type(screen.getByLabelText('Buscar proyectos por nombre'), 'zzz');
    expect(screen.queryByRole('article')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(visibles()).toEqual(['Telepeaje', 'Parqueaderos', 'Conciliación']);
    expect(window.location.search).toBe('');
  });

  it('la tarjeta muestra el desglose que explica por qué el chip la deja o la quita', () => {
    pintar();
    const telepeaje = screen.getAllByRole('article')[0]!;

    expect(within(telepeaje).getByLabelText('Alta: 2 tareas')).toBeTruthy();
    expect(within(telepeaje).getByLabelText('Baja: 1 tarea')).toBeTruthy();
    // Sin tareas de prioridad media no se pinta un cero: sería ruido.
    expect(within(telepeaje).queryByLabelText(/^Media:/)).toBeNull();
  });
});
