import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../lib/api-client.ts';
import { LabelManagerDialog } from '../LabelManagerDialog.tsx';
import type { Label } from '../../../types/api.ts';

vi.mock('../../../lib/api-client.ts', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

function renderDialog(open = true, onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <LabelManagerDialog open={open} onClose={onClose} projectId="p-1" />
    </QueryClientProvider>,
  );
}

describe('LabelManagerDialog (SL-18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue([]);
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
  });

  it('lista las etiquetas existentes con su color y conteo de tareas asociadas', async () => {
    const mockLabels: Label[] = [
      {
        id: 'lbl-1',
        projectId: 'p-1',
        name: 'Backend',
        color: 'indigo',
        taskCount: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'lbl-2',
        projectId: 'p-1',
        name: 'Urgente',
        color: 'red',
        taskCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    vi.mocked(api.get).mockResolvedValueOnce(mockLabels);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId('label-list')).toBeTruthy();
    });

    expect(screen.getByText('Backend')).toBeTruthy();
    expect(screen.getByText('3 tareas')).toBeTruthy();
    expect(screen.getByText('Urgente')).toBeTruthy();
    expect(screen.getByText('0 tareas')).toBeTruthy();
  });

  it('permite crear una etiqueta eligiendo nombre y color', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValueOnce([]);
    vi.mocked(api.post).mockResolvedValueOnce({
      id: 'lbl-nueva',
      projectId: 'p-1',
      name: 'Frontend',
      color: 'teal',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    renderDialog();

    await waitFor(() => {
      expect(screen.getByLabelText('Nueva etiqueta')).toBeTruthy();
    });

    const inputNombre = screen.getByLabelText('Nueva etiqueta');
    const selectColor = screen.getByLabelText('Color');
    const botonAnadir = screen.getByRole('button', { name: 'Añadir' });

    await user.type(inputNombre, 'Frontend');
    await user.selectOptions(selectColor, 'teal');
    await user.click(botonAnadir);

    expect(api.post).toHaveBeenCalledWith('/projects/p-1/labels', {
      name: 'Frontend',
      color: 'teal',
    });
  });

  it('permite editar nombre y color de una etiqueta existente', async () => {
    const user = userEvent.setup();
    const mockLabels: Label[] = [
      {
        id: 'lbl-1',
        projectId: 'p-1',
        name: 'Backend',
        color: 'indigo',
        taskCount: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    vi.mocked(api.get).mockResolvedValueOnce(mockLabels);
    vi.mocked(api.patch).mockResolvedValueOnce({
      id: 'lbl-1',
      projectId: 'p-1',
      name: 'Core Engine',
      color: 'orange',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    renderDialog();

    await waitFor(() => {
      expect(screen.getByText('Backend')).toBeTruthy();
    });

    const botonEditar = screen.getByLabelText('Editar etiqueta Backend');
    await user.click(botonEditar);

    const inputEditNombre = screen.getByLabelText('Nombre de etiqueta');
    const selectEditColor = screen.getByLabelText('Color de etiqueta');
    const botonGuardar = screen.getByLabelText('Guardar cambios de etiqueta');

    await user.clear(inputEditNombre);
    await user.type(inputEditNombre, 'Core Engine');
    await user.selectOptions(selectEditColor, 'orange');
    await user.click(botonGuardar);

    expect(api.patch).toHaveBeenCalledWith('/labels/lbl-1', {
      name: 'Core Engine',
      color: 'orange',
    });
  });

  it('elimina directamente una etiqueta libre de tareas (taskCount = 0)', async () => {
    const user = userEvent.setup();
    const mockLabels: Label[] = [
      {
        id: 'lbl-libre',
        projectId: 'p-1',
        name: 'Temporal',
        color: 'slate',
        taskCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    vi.mocked(api.get).mockResolvedValueOnce(mockLabels);
    vi.mocked(api.delete).mockResolvedValueOnce(undefined);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByText('Temporal')).toBeTruthy();
    });

    const botonEliminar = screen.getByLabelText('Eliminar etiqueta Temporal');
    await user.click(botonEliminar);

    expect(screen.queryByTestId('label-delete-confirm-box')).toBeNull();
    expect(api.delete).toHaveBeenCalledWith('/labels/lbl-libre');
  });

  it('alerta explícitamente y requiere confirmación cuando la etiqueta tiene tareas asignadas', async () => {
    const user = userEvent.setup();
    const mockLabels: Label[] = [
      {
        id: 'lbl-ocupada',
        projectId: 'p-1',
        name: 'Urgente',
        color: 'red',
        taskCount: 5,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    vi.mocked(api.get).mockResolvedValueOnce(mockLabels);
    vi.mocked(api.delete).mockResolvedValueOnce(undefined);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByText('Urgente')).toBeTruthy();
    });

    const botonEliminar = screen.getByLabelText('Eliminar etiqueta Urgente');
    await user.click(botonEliminar);

    // No se llama a DELETE de inmediato
    expect(api.delete).not.toHaveBeenCalled();

    // Se muestra el cuadro de advertencia indicando el número exacto de tareas afectadas
    const confirmBox = screen.getByTestId('label-delete-confirm-box');
    expect(confirmBox).toBeTruthy();
    expect(confirmBox.textContent).toContain('«Urgente» está asignada a 5 tareas');

    // Al confirmar, se envía confirm=true
    const botonConfirmar = screen.getByRole('button', { name: 'Eliminar de todas las tareas' });
    await user.click(botonConfirmar);

    expect(api.delete).toHaveBeenCalledWith('/labels/lbl-ocupada?confirm=true');
  });
});
