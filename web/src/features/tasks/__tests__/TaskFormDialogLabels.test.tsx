import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../lib/api-client.ts';
import { TaskFormDialog } from '../TaskFormDialog.tsx';
import type { Label, ProjectColumnSummary, Task } from '../../../types/api.ts';

vi.mock('../../../lib/api-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-client.ts')>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const COLUMNAS: ProjectColumnSummary[] = [
  {
    id: 'col-1',
    projectId: 'p-1',
    name: 'Por hacer',
    category: 'TODO',
    position: 1024,
    wipLimit: null,
    sort: 'manual',
    taskCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const LABELS_MOCK: Label[] = [
  {
    id: 'lbl-1',
    projectId: 'p-1',
    name: 'Backend',
    color: 'indigo',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'lbl-2',
    projectId: 'p-1',
    name: 'Urgente',
    color: 'red',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function renderDialog(task?: Task, onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TaskFormDialog
        open
        onClose={onClose}
        projectId="p-1"
        columnas={COLUMNAS}
        {...(task ? { task } : {})}
      />
    </QueryClientProvider>,
  );
}

describe('TaskFormDialog — Asignación y desasignación de etiquetas (SL-18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue(LABELS_MOCK);
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
  });

  it('permite seleccionar y deseleccionar etiquetas al crear una tarea, guardando vía PUT', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    vi.mocked(api.post).mockResolvedValueOnce({
      id: 'task-nueva',
      projectId: 'p-1',
      columnId: 'col-1',
      title: 'Nueva tarea con etiquetas',
      status: 'TODO',
      priority: 'MEDIUM',
      position: 1024,
      dueDate: null,
      completedAt: null,
      labels: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    vi.mocked(api.put).mockResolvedValueOnce({
      id: 'task-nueva',
      projectId: 'p-1',
      labels: LABELS_MOCK.slice(0, 1),
    });

    renderDialog(undefined, onClose);

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Backend' })).toBeTruthy();
    });

    const botonBackend = screen.getByRole('checkbox', { name: 'Backend' });
    const botonUrgente = screen.getByRole('checkbox', { name: 'Urgente' });

    expect(botonBackend.getAttribute('aria-checked')).toBe('false');
    expect(botonUrgente.getAttribute('aria-checked')).toBe('false');

    // Seleccionar Backend
    await user.click(botonBackend);
    expect(botonBackend.getAttribute('aria-checked')).toBe('true');

    // Seleccionar y luego deseleccionar Urgente
    await user.click(botonUrgente);
    expect(botonUrgente.getAttribute('aria-checked')).toBe('true');
    await user.click(botonUrgente);
    expect(botonUrgente.getAttribute('aria-checked')).toBe('false');

    // Completar título y guardar
    const inputTitulo = screen.getByLabelText('Título');
    await user.type(inputTitulo, 'Nueva tarea con etiquetas');

    const botonCrear = screen.getByRole('button', { name: 'Crear tarea' });
    await user.click(botonCrear);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/tasks/task-nueva/labels', {
        labelIds: ['lbl-1'],
      });
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('precarga las etiquetas de una tarea en edición y actualiza las asignaciones al desasociar', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    const tareaExistente: Task = {
      id: 'task-existente',
      projectId: 'p-1',
      columnId: 'col-1',
      title: 'Tarea existente con Backend',
      description: null,
      status: 'TODO',
      priority: 'HIGH',
      position: 1024,
      dueDate: null,
      completedAt: null,
      labels: LABELS_MOCK.slice(0, 1),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    vi.mocked(api.patch).mockResolvedValueOnce({
      ...tareaExistente,
      title: 'Tarea existente modificada',
    });

    vi.mocked(api.put).mockResolvedValueOnce({
      ...tareaExistente,
      labels: [],
    });

    renderDialog(tareaExistente, onClose);

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Backend' })).toBeTruthy();
    });

    const botonBackend = screen.getByRole('checkbox', { name: 'Backend' });
    // Inicialmente seleccionada porque la tarea la tiene
    expect(botonBackend.getAttribute('aria-checked')).toBe('true');

    // Deseleccionar Backend
    await user.click(botonBackend);
    expect(botonBackend.getAttribute('aria-checked')).toBe('false');

    const botonGuardar = screen.getByRole('button', { name: 'Guardar cambios' });
    await user.click(botonGuardar);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/tasks/task-existente/labels', {
        labelIds: [],
      });
    });

    expect(onClose).toHaveBeenCalled();
  });
});
