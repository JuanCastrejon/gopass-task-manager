import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectColumnSummary, Task } from '../../../types/api.ts';
import { api, ApiError } from '../../../lib/api-client.ts';
import { TaskBoard } from '../TaskBoard.tsx';

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: (props: { children: React.ReactNode }) => {
      return <div data-testid="dnd-context">{props.children}</div>;
    },
  };
});

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

const COLUMNA_TODO: ProjectColumnSummary = {
  id: 'col-todo',
  projectId: 'proj-1',
  name: 'Por hacer',
  category: 'TODO',
  position: 1024,
  wipLimit: null,
  sort: 'priority_desc',
  taskCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const COLUMNA_INPROGRESS: ProjectColumnSummary = {
  id: 'col-inprogress',
  projectId: 'proj-1',
  name: 'En progreso',
  category: 'IN_PROGRESS',
  position: 2048,
  wipLimit: null,
  sort: 'manual',
  taskCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const COLUMNAS: ProjectColumnSummary[] = [COLUMNA_TODO, COLUMNA_INPROGRESS];

const TAREAS: Task[] = [
  {
    id: 'task-1',
    projectId: 'proj-1',
    columnId: 'col-todo',
    title: 'Tarea 1',
    description: null,
    status: 'TODO',
    priority: 'HIGH',
    position: 1024,
    dueDate: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function pintar(columnas = COLUMNAS, tareas = TAREAS) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path.includes('/tasks')) {
      return tareas;
    }
    return [];
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TaskBoard projectId="proj-1" columnas={columnas} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('SL-21 — Renombrar una columna desde la cabecera del tablero', () => {
  it('1. Pulsar el título abre el campo con el texto seleccionado y el foco dentro', async () => {
    const user = userEvent.setup();
    pintar();

    // Esperar a que el tablero se pinte
    await screen.findByText('Tarea 1');

    const boton = screen.getByRole('button', { name: 'Renombrar columna: Por hacer' });
    expect(boton).toBeTruthy();

    await user.click(boton);

    // Se monta el <input>, con el foco dentro y el texto seleccionado
    const input = (await screen.findByRole('textbox', {
      name: 'Nombre de la columna Por hacer',
    })) as HTMLInputElement;

    expect(input).toBeTruthy();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('Por hacer');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('Por hacer'.length);
  });

  it('2. Enter guarda y llama a la API con el nombre nuevo', async () => {
    const user = userEvent.setup();
    pintar();

    await screen.findByText('Tarea 1');

    vi.mocked(api.patch).mockResolvedValueOnce({
      ...COLUMNA_TODO,
      name: 'Nuevas tareas',
    });

    const boton = screen.getByRole('button', { name: 'Renombrar columna: Por hacer' });
    await user.click(boton);

    const input = (await screen.findByRole('textbox', {
      name: 'Nombre de la columna Por hacer',
    })) as HTMLInputElement;

    await user.clear(input);
    await user.type(input, 'Nuevas tareas{Enter}');

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledTimes(1);
      expect(api.patch).toHaveBeenCalledWith('/projects/proj-1/columns/col-todo', {
        name: 'Nuevas tareas',
      });
    });

    // Al salir: se restaura el encabezado con el nuevo nombre y el foco vuelve al botón
    const botonRestaurado = await screen.findByRole('button', { name: 'Renombrar columna: Nuevas tareas' });
    expect(botonRestaurado).toBeTruthy();
    expect(document.activeElement).toBe(botonRestaurado);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('3. Escape cancela, restaura el valor previo y no llama a la API', async () => {
    const user = userEvent.setup();
    pintar();

    await screen.findByText('Tarea 1');

    const boton = screen.getByRole('button', { name: 'Renombrar columna: Por hacer' });
    await user.click(boton);

    const input = (await screen.findByRole('textbox', {
      name: 'Nombre de la columna Por hacer',
    })) as HTMLInputElement;

    await user.type(input, ' modificado');
    expect(input.value).toBe('Por hacer modificado');

    await user.keyboard('{Escape}');

    // Se restaura el encabezado, el nombre previo vuelve y el foco regresa al botón
    const botonRestaurado = screen.getByRole('button', { name: 'Renombrar columna: Por hacer' });
    expect(botonRestaurado).toBeTruthy();
    expect(document.activeElement).toBe(botonRestaurado);
    expect(screen.queryByRole('textbox')).toBeNull();

    // No se envía ninguna petición
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('4. blur con el valor cambiado guarda; con el valor idéntico o vacío no llama a la API', async () => {
    const user = userEvent.setup();
    pintar();

    await screen.findByText('Tarea 1');

    // 4a. blur con el valor cambiado guarda
    vi.mocked(api.patch).mockResolvedValueOnce({
      ...COLUMNA_TODO,
      name: 'Guardado con blur',
    });

    const boton = screen.getByRole('button', { name: 'Renombrar columna: Por hacer' });
    await user.click(boton);

    const input = (await screen.findByRole('textbox', {
      name: 'Nombre de la columna Por hacer',
    })) as HTMLInputElement;

    await user.clear(input);
    await user.type(input, 'Guardado con blur');

    fireEvent.blur(input);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledTimes(1);
      expect(api.patch).toHaveBeenCalledWith('/projects/proj-1/columns/col-todo', {
        name: 'Guardado con blur',
      });
    });

    const botonNuevo = await screen.findByRole('button', { name: 'Renombrar columna: Guardado con blur' });
    expect(botonNuevo).toBeTruthy();

    // 4b. blur con valor idéntico no llama a la API
    vi.mocked(api.patch).mockClear();
    await user.click(botonNuevo);

    const inputIdentico = (await screen.findByRole('textbox', {
      name: 'Nombre de la columna Guardado con blur',
    })) as HTMLInputElement;

    fireEvent.blur(inputIdentico);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Renombrar columna: Guardado con blur' })).toBeTruthy();
    });
    expect(api.patch).not.toHaveBeenCalled();

    // 4c. blur con valor vacío tras recortar no llama a la API y restaura el valor original
    vi.mocked(api.patch).mockClear();
    const botonReabrir = screen.getByRole('button', { name: 'Renombrar columna: Guardado con blur' });
    await user.click(botonReabrir);

    const inputVacio = (await screen.findByRole('textbox', {
      name: 'Nombre de la columna Guardado con blur',
    })) as HTMLInputElement;

    await user.clear(inputVacio);
    await user.type(inputVacio, '     ');

    fireEvent.blur(inputVacio);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Renombrar columna: Guardado con blur' })).toBeTruthy();
    });
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('5. Un 409 deja el campo abierto, con el foco dentro y el mensaje en role="alert"', async () => {
    const user = userEvent.setup();
    pintar();

    await screen.findByText('Tarea 1');

    const err409 = new ApiError(
      409,
      {
        type: 'https://httpstatuses.com/409',
        title: 'Conflict',
        status: 409,
        code: 'COLUMN_NAME_TAKEN',
        detail: 'Este proyecto ya tiene una columna llamada "En progreso".',
      },
      'Este proyecto ya tiene una columna llamada "En progreso".',
    );
    vi.mocked(api.patch).mockRejectedValueOnce(err409);

    const boton = screen.getByRole('button', { name: 'Renombrar columna: Por hacer' });
    await user.click(boton);

    const input = (await screen.findByRole('textbox', {
      name: 'Nombre de la columna Por hacer',
    })) as HTMLInputElement;

    await user.clear(input);
    await user.type(input, 'En progreso{Enter}');

    // El mensaje de conflicto aparece en role="alert"
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Este proyecto ya tiene una columna llamada "En progreso".');

    // El campo permanece abierto, no pierde lo tecleado, conserva foco y aria-invalid
    expect(input).toBeTruthy();
    expect(input.value).toBe('En progreso');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(input);
  });
});
