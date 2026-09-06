import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../lib/api-client.ts';
import { ProjectFormDialog } from '../ProjectFormDialog.tsx';
import { ProjectDetailPage } from '../ProjectDetailPage.tsx';
import type { ProjectSummary, ProjectColumnSummary } from '../../../types/api.ts';

vi.mock('../../../lib/api-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-client.ts')>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

// Mock del tablero interno para aislar la prueba de ProjectDetailPage
vi.mock('../../tasks/TaskBoard.tsx', () => ({
  TaskBoard: () => (
    <div data-testid="mock-taskboard">
      <div className="min-w-0 rounded-lg border border-border bg-surface px-3 py-1.5 shadow-xs">
        <h2 className="text-sm font-semibold text-ink">Tareas</h2>
        <p className="text-xs text-ink-muted">
          Arrastra para mover entre columnas o reordena dentro de columnas con orden manual
        </p>
      </div>
    </div>
  ),
}));

function crearQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

const mockProject = (overrides?: Partial<ProjectSummary>): ProjectSummary => ({
  id: 'p-1',
  name: 'Proyecto Demo',
  description: 'Descripción de prueba',
  background: 'neutro',
  taskCount: 3,
  doneCount: 1,
  progress: 33,
  byPriority: { LOW: 1, MEDIUM: 1, HIGH: 1 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const mockColumns: ProjectColumnSummary[] = [
  {
    id: 'col-1',
    projectId: 'p-1',
    name: 'Por hacer',
    category: 'TODO',
    position: 1024,
    wipLimit: null,
    sort: 'manual',
    taskCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('Fondo de tablero por proyecto (SL-19 paso 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
  });

  describe('ProjectFormDialog — selector de fondo', () => {
    it('muestra los seis fondos de la paleta cerrada con nombre accesible', () => {
      render(
        <QueryClientProvider client={crearQueryClient()}>
          <ProjectFormDialog open onClose={vi.fn()} />
        </QueryClientProvider>,
      );

      const grupo = screen.getByRole('radiogroup', { name: 'Fondo del tablero' });
      expect(grupo).toBeTruthy();

      const nombres = ['Neutro', 'Azul', 'Verde', 'Ámbar', 'Púrpura', 'Rosa'];
      for (const nombre of nombres) {
        const opcion = screen.getByRole('radio', { name: nombre });
        expect(opcion).toBeTruthy();
      }
    });

    it('preselecciona neutro al crear y permite elegir otro fondo enviándolo en la mutación', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      vi.mocked(api.post).mockResolvedValueOnce({
        id: 'p-nuevo',
        name: 'Nuevo Proyecto',
        background: 'verde',
      });

      render(
        <QueryClientProvider client={crearQueryClient()}>
          <ProjectFormDialog open onClose={onClose} />
        </QueryClientProvider>,
      );

      const opcionNeutro = screen.getByRole('radio', { name: 'Neutro' });
      expect(opcionNeutro.getAttribute('aria-checked')).toBe('true');

      // Seleccionar Verde
      const opcionVerde = screen.getByRole('radio', { name: 'Verde' });
      await user.click(opcionVerde);
      expect(opcionVerde.getAttribute('aria-checked')).toBe('true');
      expect(opcionNeutro.getAttribute('aria-checked')).toBe('false');

      // Rellenar nombre y enviar
      await user.type(screen.getByLabelText('Nombre'), 'Nuevo Proyecto');
      await user.click(screen.getByRole('button', { name: 'Crear proyecto' }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/projects',
          expect.objectContaining({
            name: 'Nuevo Proyecto',
            background: 'verde',
          }),
        );
      });
    });

    it('al editar inicializa con el fondo actual del proyecto y permite actualizarlo', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const proyecto = mockProject({ background: 'azul' });

      vi.mocked(api.patch).mockResolvedValueOnce({
        ...proyecto,
        background: 'purpura',
      });

      render(
        <QueryClientProvider client={crearQueryClient()}>
          <ProjectFormDialog open onClose={onClose} project={proyecto} />
        </QueryClientProvider>,
      );

      // Azul debe estar seleccionado
      expect(screen.getByRole('radio', { name: 'Azul' }).getAttribute('aria-checked')).toBe('true');

      // Cambiar a Púrpura
      await user.click(screen.getByRole('radio', { name: 'Púrpura' }));
      expect(screen.getByRole('radio', { name: 'Púrpura' }).getAttribute('aria-checked')).toBe('true');

      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          `/projects/${proyecto.id}`,
          expect.objectContaining({
            background: 'purpura',
          }),
        );
      });
    });
  });

  describe('ProjectDetailPage — aplicación del fondo y regla categórica de contraste', () => {
    it('aplica la clase bg-board-azul al contenedor a sangre cuando el proyecto tiene fondo azul', async () => {
      vi.mocked(api.get).mockImplementation((url) => {
        if (url === '/projects/p-1') return Promise.resolve(mockProject({ background: 'azul' }));
        if (url === '/projects/p-1/columns') return Promise.resolve(mockColumns);
        return Promise.reject(new Error('not found'));
      });

      render(
        <QueryClientProvider client={crearQueryClient()}>
          <ProjectDetailPage projectId="p-1" />
        </QueryClientProvider>,
      );

      const area = await screen.findByTestId('project-board-area');
      await waitFor(() => expect(area.className).toContain('bg-board-azul'));
      expect(area.className).toContain('min-h-[calc(100dvh-3.5rem)]');
    });

    it('aplica bg-board-neutro cuando el fondo es neutro dejando el aspecto por defecto', async () => {
      vi.mocked(api.get).mockImplementation((url) => {
        if (url === '/projects/p-1') return Promise.resolve(mockProject({ background: 'neutro' }));
        if (url === '/projects/p-1/columns') return Promise.resolve(mockColumns);
        return Promise.reject(new Error('not found'));
      });

      render(
        <QueryClientProvider client={crearQueryClient()}>
          <ProjectDetailPage projectId="p-1" />
        </QueryClientProvider>,
      );

      const area = await screen.findByTestId('project-board-area');
      expect(area.className).toContain('bg-board-neutro');
    });

    it('regla de contraste: el enlace Volver a proyectos se apoya en superficie opaca bg-surface', async () => {
      vi.mocked(api.get).mockImplementation((url) => {
        if (url === '/projects/p-1') return Promise.resolve(mockProject({ background: 'ambar' }));
        if (url === '/projects/p-1/columns') return Promise.resolve(mockColumns);
        return Promise.reject(new Error('not found'));
      });

      render(
        <QueryClientProvider client={crearQueryClient()}>
          <ProjectDetailPage projectId="p-1" />
        </QueryClientProvider>,
      );

      const link = await screen.findByRole('link', { name: /Volver a proyectos/i });
      expect(link.className).toContain('bg-surface');
      expect(link.className).toContain('border-border');
    });

    it('regla de contraste: Tareas y su subtítulo se apoyan en superficie opaca bg-surface en TaskBoard', async () => {
      const { TaskBoard } = await vi.importActual<typeof import('../../tasks/TaskBoard.tsx')>(
        '../../tasks/TaskBoard.tsx',
      );

      render(
        <QueryClientProvider client={crearQueryClient()}>
          <TaskBoard projectId="p-1" columnas={mockColumns} />
        </QueryClientProvider>,
      );

      const heading = screen.getByRole('heading', { level: 2, name: 'Tareas' });
      const contenedorTexto = heading.closest('div');
      expect(contenedorTexto?.className).toContain('bg-surface');
      expect(contenedorTexto?.className).toContain('border-border');
    });
  });
});
