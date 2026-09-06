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

describe('ProjectsPage — búsqueda', () => {
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

  it('no ofrece filtros de prioridad: fuera del proyecto solo se busca', () => {
    pintar();

    // Un proyecto no tiene prioridad, así que un chip aquí prometería una
    // dimensión que la entidad no posee. Los filtros ricos viven dentro del
    // tablero, donde esa dimensión sí existe.
    for (const etiqueta of ['Todas', 'Baja', 'Media', 'Alta']) {
      expect(screen.queryByRole('button', { name: etiqueta })).toBeNull();
    }
    expect(screen.getByLabelText('Buscar proyectos por nombre')).toBeTruthy();
  });

  it('deja la búsqueda en la URL para poder compartirla', async () => {
    const user = userEvent.setup();
    pintar();

    await user.type(screen.getByLabelText('Buscar proyectos por nombre'), 'parque');

    // La lista ya está filtrada aunque la URL todavía no lo diga: ese desfase
    // es el diseño, no un fallo. Filtrar en cliente no necesita esperar al
    // retardo, que existe solo para no llenar el historial.
    expect(visibles()).toEqual(['Parqueaderos']);

    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get('q')).toBe('parque');
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

  it('«Limpiar búsqueda» devuelve la lista entera', async () => {
    const user = userEvent.setup();
    pintar();

    await user.type(screen.getByLabelText('Buscar proyectos por nombre'), 'zzz');
    expect(screen.queryByRole('article')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));

    expect(visibles()).toEqual(['Telepeaje', 'Parqueaderos', 'Conciliación']);
    expect(window.location.search).toBe('');
  });

  it('la tarjeta señala si hay tareas de prioridad alta, y solo eso', () => {
    pintar();
    const [telepeaje, parqueaderos] = screen.getAllByRole('article');

    // Telepeaje tiene dos de prioridad alta: se señalan, junto al avance.
    expect(within(telepeaje!).getByLabelText('2 tareas de prioridad alta')).toBeTruthy();

    // Baja y media son estado operativo normal, no decisión: no se pintan.
    expect(within(telepeaje!).queryByLabelText(/prioridad baja/)).toBeNull();
    expect(within(telepeaje!).queryByLabelText(/prioridad media/)).toBeNull();

    // Parqueaderos solo tiene medias: la tarjeta no señala nada.
    expect(within(parqueaderos!).queryByLabelText(/prioridad alta/)).toBeNull();
  });

  it('la tarjeta entera es un enlace al proyecto, sin anidar los botones dentro', () => {
    pintar();
    const telepeaje = screen.getAllByRole('article')[0]!;

    const enlace = within(telepeaje).getByRole('link', { name: 'Abrir tareas de Telepeaje' });
    expect(enlace.getAttribute('href')).toMatch(/^\/projects\//);

    // Un `<a>` no puede contener contenido interactivo: los botones son
    // hermanos del enlace, no descendientes.
    const editar = within(telepeaje).getByRole('button', { name: 'Editar Telepeaje' });
    expect(enlace.contains(editar)).toBe(false);

    // Tres paradas de tabulación, ni una más: editar, eliminar y el enlace.
    // «Ver tareas» es un `<span>` dentro del mismo enlace, no un segundo.
    expect(within(telepeaje).getAllByRole('link')).toHaveLength(1);
  });
});
