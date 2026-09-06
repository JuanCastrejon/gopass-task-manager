import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { TaskCard } from '../TaskCard.tsx';
import type { ProjectColumnSummary, Task } from '../../../types/api.ts';

const COLUMNA_DONE_1: ProjectColumnSummary = {
  id: 'col-done-1',
  projectId: 'proj-1',
  name: 'Completada',
  category: 'DONE',
  position: 3000,
  wipLimit: null,
  sort: 'manual',
  taskCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const COLUMNA_DONE_2: ProjectColumnSummary = {
  id: 'col-done-2',
  projectId: 'proj-1',
  name: 'Desplegado',
  category: 'DONE',
  position: 4000,
  wipLimit: null,
  sort: 'manual',
  taskCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const TAREA_PENDIENTE: Task = {
  id: 'task-1',
  projectId: 'proj-1',
  columnId: 'col-todo',
  title: 'Implementar control de un clic',
  description: 'Probar el círculo de verificación',
  status: 'TODO',
  priority: 'HIGH',
  position: 1024,
  dueDate: null,
  completedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const TAREA_COMPLETADA: Task = {
  id: 'task-2',
  projectId: 'proj-1',
  columnId: 'col-done-1',
  title: 'Tarea ya realizada',
  description: null,
  status: 'DONE',
  priority: 'LOW',
  position: 2048,
  dueDate: null,
  completedAt: '2026-01-02T10:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T10:00:00.000Z',
};

function renderizarTarjeta({
  task = TAREA_PENDIENTE,
  columnasDone = [COLUMNA_DONE_1],
  onMove = vi.fn(),
  onEdit = vi.fn(),
  onDelete = vi.fn(),
  autoFocus = false,
  onPointerDownContainer,
}: {
  task?: Task;
  columnasDone?: ProjectColumnSummary[];
  onMove?: (columnId: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  autoFocus?: boolean;
  onPointerDownContainer?: () => void;
} = {}) {
  return render(
    <div onPointerDown={onPointerDownContainer}>
      <DndContext>
        <SortableContext items={[task.id]}>
          <TaskCard
            task={task}
            pending={false}
            autoFocus={autoFocus}
            anterior={null}
            siguiente={null}
            columnasDone={columnasDone}
            onMove={onMove}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </SortableContext>
      </DndContext>
    </div>,
  );
}

describe('SL-16 — Completar una tarea de un clic', () => {
  it('1. Con una sola columna DONE, pulsar el círculo mueve la tarea a esa columna en una sola acción', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();

    renderizarTarjeta({
      columnasDone: [COLUMNA_DONE_1],
      onMove,
    });

    const boton = screen.getByRole('button', {
      name: `Completar "${TAREA_PENDIENTE.title}": mover a ${COLUMNA_DONE_1.name}`,
    });
    expect(boton).toBeTruthy();

    await user.click(boton);

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(COLUMNA_DONE_1.id);
  });

  it('2. Con dos columnas DONE, pulsar el círculo no mueve nada todavía y abre el menú con los dos destinos; elegir uno la mueve a ese', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();

    renderizarTarjeta({
      columnasDone: [COLUMNA_DONE_1, COLUMNA_DONE_2],
      onMove,
    });

    const boton = screen.getByRole('button', {
      name: `Completar "${TAREA_PENDIENTE.title}": elegir columna`,
    });
    expect(boton.getAttribute('aria-haspopup')).toBe('menu');
    expect(boton.getAttribute('aria-expanded')).toBe('false');

    // Pulsar el círculo NO mueve nada todavía
    await user.click(boton);
    expect(onMove).not.toHaveBeenCalled();
    expect(boton.getAttribute('aria-expanded')).toBe('true');

    // Abre el menú con los dos destinos
    const menu = screen.getByRole('menu', {
      name: `Destinos para completar "${TAREA_PENDIENTE.title}"`,
    });
    expect(menu).toBeTruthy();

    const item1 = screen.getByRole('menuitem', { name: COLUMNA_DONE_1.name });
    const item2 = screen.getByRole('menuitem', { name: COLUMNA_DONE_2.name });
    expect(item1).toBeTruthy();
    expect(item2).toBeTruthy();

    // El foco viaja al primer destino al abrir
    expect(document.activeElement).toBe(item1);

    // Elegir el segundo destino mueve la tarea a ese
    await user.click(item2);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(COLUMNA_DONE_2.id);
  });

  it('3. Escape cierra el menú sin mover la tarea y devuelve el foco al botón', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();

    renderizarTarjeta({
      columnasDone: [COLUMNA_DONE_1, COLUMNA_DONE_2],
      onMove,
    });

    const boton = screen.getByRole('button', {
      name: `Completar "${TAREA_PENDIENTE.title}": elegir columna`,
    });
    await user.click(boton);

    expect(screen.getByRole('menu')).toBeTruthy();
    expect(onMove).not.toHaveBeenCalled();

    // Pulsar Escape cierra el menú sin mover
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(onMove).not.toHaveBeenCalled();

    // Devuelve el foco al botón
    expect(document.activeElement).toBe(boton);
  });

  it('4. En una tarea ya completada, el círculo no es un botón y no hay acción que dispare', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();

    renderizarTarjeta({
      task: TAREA_COMPLETADA,
      columnasDone: [COLUMNA_DONE_1],
      onMove,
    });

    // No debe haber botón de completar
    const botonCompletar = screen.queryByRole('button', {
      name: /completar/i,
    });
    expect(botonCompletar).toBeNull();

    // Debe existir el indicador visual no interactivo con texto accesible
    const indicador = screen.getByText('Completada');
    expect(indicador).toBeTruthy();
    expect(indicador.closest('button')).toBeNull();

    // Pulsar sobre el indicador no dispara acción
    await user.click(indicador);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('5. Pulsar el círculo no inicia un arrastre', async () => {
    const user = userEvent.setup();
    const contenedorPointerSpy = vi.fn();

    renderizarTarjeta({
      columnasDone: [COLUMNA_DONE_1],
      onPointerDownContainer: contenedorPointerSpy,
    });

    const boton = screen.getByRole('button', {
      name: `Completar "${TAREA_PENDIENTE.title}": mover a ${COLUMNA_DONE_1.name}`,
    });

    // Al hacer clic en el botón, el pointerdown no debe alcanzar el contenedor
    // porque SIN_ARRASTRE detiene la propagación en fase de captura.
    await user.click(boton);
    expect(contenedorPointerSpy).not.toHaveBeenCalled();

    // En cambio, hacer clic en el texto de la tarjeta sí propaga el evento
    const texto = screen.getByText(TAREA_PENDIENTE.title);
    await user.click(texto);
    expect(contenedorPointerSpy).toHaveBeenCalled();
  });
});
