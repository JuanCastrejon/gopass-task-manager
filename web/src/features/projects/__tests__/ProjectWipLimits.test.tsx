import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../lib/api-client.ts';
import { ProjectFormDialog } from '../ProjectFormDialog.tsx';
import type { ProjectColumnSummary, ProjectSummary } from '../../../types/api.ts';

/**
 * Los límites de trabajo en curso, en las dos superficies del diálogo de
 * proyecto (SL-22).
 *
 * Lo que se fija aquí no es el aspecto sino **qué llega a la API**: al crear,
 * una plantilla; al editar, un PATCH por columna sobre el mismo campo. Si las
 * dos superficies dejaran de escribir lo mismo, el usuario vería un número en
 * un sitio y otro distinto en el otro.
 */

vi.mock('../../../lib/api-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-client.ts')>();
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  };
});

function envolver(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const proyecto: ProjectSummary = {
  id: 'p-1',
  name: 'Telepeaje',
  description: null,
  background: 'neutro',
  taskCount: 0,
  doneCount: 0,
  progress: 0,
  byPriority: { LOW: 0, MEDIUM: 0, HIGH: 0 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const columnas: ProjectColumnSummary[] = [
  { id: 'c-1', projectId: 'p-1', name: 'Por hacer', category: 'TODO', position: 1, wipLimit: null, sort: 'manual', taskCount: 0, createdAt: '', updatedAt: '' },
  { id: 'c-2', projectId: 'p-1', name: 'En curso', category: 'IN_PROGRESS', position: 2, wipLimit: 2, sort: 'manual', taskCount: 0, createdAt: '', updatedAt: '' },
  { id: 'c-3', projectId: 'p-1', name: 'Completada', category: 'DONE', position: 3, wipLimit: null, sort: 'manual', taskCount: 0, createdAt: '', updatedAt: '' },
];

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.patch).mockReset();

  // jsdom no implementa el diálogo nativo, y `Modal` se apoya en él para el
  // foco y la capa modal. Se sustituye por lo mínimo que necesita el árbol.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

describe('al crear un proyecto, la plantilla de límites', () => {
  it('envía «sin límites» si no se toca nada', async () => {
    vi.mocked(api.post).mockResolvedValue({ ...proyecto });
    envolver(<ProjectFormDialog open onClose={() => {}} />);

    await userEvent.type(screen.getByLabelText('Nombre'), 'Nuevo');
    await userEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).toMatchObject({
      wipTemplate: 'sin_limites',
    });
  });

  it('envía «flujo controlado» cuando se elige, y dice qué implica', async () => {
    vi.mocked(api.post).mockResolvedValue({ ...proyecto });
    envolver(<ProjectFormDialog open onClose={() => {}} />);

    const opcion = screen.getByRole('radio', { name: /Flujo controlado/ });
    // El número no se esconde: quien elige la plantilla sabe qué acepta.
    expect(opcion.textContent).toContain('2');
    await userEvent.click(opcion);

    await userEvent.type(screen.getByLabelText('Nombre'), 'Nuevo');
    await userEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).toMatchObject({
      wipTemplate: 'flujo_controlado',
    });
  });

  it('no pide números por columna, porque al crear no hay columnas', () => {
    envolver(<ProjectFormDialog open onClose={() => {}} />);
    expect(screen.queryByLabelText(/^Límite de trabajo en curso de/)).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('al editar un proyecto, los límites de sus columnas', () => {
  it('se muestran uno por columna con su valor actual', async () => {
    vi.mocked(api.get).mockResolvedValue(columnas);
    envolver(<ProjectFormDialog open onClose={() => {}} project={proyecto} />);

    const enCurso = await screen.findByLabelText('Límite de trabajo en curso de En curso');
    expect((enCurso as HTMLInputElement).value).toBe('2');
    expect((screen.getByLabelText('Límite de trabajo en curso de Por hacer') as HTMLInputElement).value).toBe('');
  });

  it('una columna terminal no ofrece campo: limitar lo terminado no significa nada', async () => {
    vi.mocked(api.get).mockResolvedValue(columnas);
    envolver(<ProjectFormDialog open onClose={() => {}} project={proyecto} />);

    await screen.findByLabelText('Límite de trabajo en curso de En curso');
    expect(screen.queryByLabelText('Límite de trabajo en curso de Completada')).toBeNull();
  });

  it('cambiar el número lo guarda en su columna al salir del campo', async () => {
    vi.mocked(api.get).mockResolvedValue(columnas);
    vi.mocked(api.patch).mockResolvedValue({ ...columnas[1], wipLimit: 5 });
    envolver(<ProjectFormDialog open onClose={() => {}} project={proyecto} />);

    const campo = await screen.findByLabelText('Límite de trabajo en curso de En curso');
    await userEvent.clear(campo);
    await userEvent.type(campo, '5');
    await userEvent.tab();

    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    const [ruta, cuerpo] = vi.mocked(api.patch).mock.calls[0]!;
    expect(ruta).toBe('/projects/p-1/columns/c-2');
    expect(cuerpo).toEqual({ wipLimit: 5 });
  });

  it('vaciar el campo quita el límite, que es distinto de poner cero', async () => {
    vi.mocked(api.get).mockResolvedValue(columnas);
    vi.mocked(api.patch).mockResolvedValue({ ...columnas[1], wipLimit: null });
    envolver(<ProjectFormDialog open onClose={() => {}} project={proyecto} />);

    const campo = await screen.findByLabelText('Límite de trabajo en curso de En curso');
    await userEvent.clear(campo);
    await userEvent.tab();

    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    expect(vi.mocked(api.patch).mock.calls[0]?.[1]).toEqual({ wipLimit: null });
  });

  it('no ofrece la plantilla: las columnas ya existen y se editan una a una', async () => {
    vi.mocked(api.get).mockResolvedValue(columnas);
    envolver(<ProjectFormDialog open onClose={() => {}} project={proyecto} />);

    await screen.findByLabelText('Límite de trabajo en curso de En curso');
    expect(screen.queryByRole('radio', { name: /Flujo controlado/ })).toBeNull();
  });
});
