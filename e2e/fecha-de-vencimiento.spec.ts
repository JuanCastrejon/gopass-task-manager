import { expect, test } from './limpieza.js';

/**
 * Escenario E2E — Fecha de vencimiento (SL-17).
 *
 * Valida el ciclo completo de la fecha de vencimiento:
 * 1. Establecer una fecha desde el diálogo de creación con el selector nativo.
 * 2. Visualizar la insignia en la tarjeta del tablero.
 * 3. Editar la fecha desde el diálogo de edición.
 * 4. Recargar la página para demostrar que la fecha persiste en PostgreSQL y no solo en React.
 * 5. Eliminar la fecha dejando el campo en blanco y verificar que la insignia desaparece tras recargar.
 */
test('poner una fecha desde el diálogo, ver la insignia en la tarjeta, recargar y que siga', async ({ page }) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E vencimiento ${sufijo}`;
  const tarea = `Auditoría TAG ${sufijo}`;

  await page.goto('/');

  // --- crear el proyecto ---
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialogoProyecto = page.getByRole('dialog');
  await dialogoProyecto.getByLabel('Nombre').fill(proyecto);
  await dialogoProyecto.getByRole('button', { name: 'Crear proyecto' }).click();

  const tarjetaProyecto = page.locator('article').filter({ hasText: proyecto });
  await expect(tarjetaProyecto).toBeVisible();

  // --- entrar al tablero ---
  await tarjetaProyecto.getByRole('link', { name: /^Abrir tareas de/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: proyecto })).toBeVisible();

  // --- crear la tarea con fecha de vencimiento ---
  const columnaPorHacer = page.getByRole('region', { name: 'Por hacer' });
  await columnaPorHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();

  const dialogoTarea = page.getByRole('dialog');
  await dialogoTarea.getByLabel('Título').fill(tarea);
  await dialogoTarea.getByLabel(/Fecha de vencimiento/i).fill('2026-10-15');
  await dialogoTarea.getByRole('button', { name: 'Crear tarea' }).click();

  // --- verificar la tarjeta y su insignia ---
  const tarjetaTarea = columnaPorHacer.locator('article').filter({ hasText: tarea });
  await expect(tarjetaTarea).toBeVisible();

  const insignia = tarjetaTarea.getByTestId('due-date-badge');
  await expect(insignia).toBeVisible();
  await expect(insignia).toContainText('15 oct');
  await expect(insignia).toHaveAttribute('aria-label', /15 de octubre/i);

  // --- editar la fecha desde el diálogo ---
  await tarjetaTarea.getByRole('button', { name: `Editar ${tarea}` }).click();
  const dialogoEdicion = page.getByRole('dialog');
  await expect(dialogoEdicion.getByLabel(/Fecha de vencimiento/i)).toHaveValue('2026-10-15');
  await dialogoEdicion.getByLabel(/Fecha de vencimiento/i).fill('2026-11-20');
  await dialogoEdicion.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(insignia).toContainText('20 nov');
  await expect(insignia).toHaveAttribute('aria-label', /20 de noviembre/i);

  // --- LA RECARGA: verificar persistencia real en PostgreSQL ---
  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: proyecto })).toBeVisible();
  const tarjetaTrasRecarga = page.getByRole('region', { name: 'Por hacer' }).locator('article').filter({ hasText: tarea });
  await expect(tarjetaTrasRecarga).toBeVisible();

  const insigniaTrasRecarga = tarjetaTrasRecarga.getByTestId('due-date-badge');
  await expect(insigniaTrasRecarga).toBeVisible();
  await expect(insigniaTrasRecarga).toContainText('20 nov');
  await expect(insigniaTrasRecarga).toHaveAttribute('aria-label', /20 de noviembre/i);

  // --- quitar la fecha dejándola en blanco ---
  await tarjetaTrasRecarga.getByRole('button', { name: `Editar ${tarea}` }).click();
  const dialogoQuitar = page.getByRole('dialog');
  await dialogoQuitar.getByLabel(/Fecha de vencimiento/i).fill('');
  await dialogoQuitar.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(tarjetaTrasRecarga.getByTestId('due-date-badge')).not.toBeVisible();

  // Recargar y comprobar que sigue sin fecha
  await page.reload();
  const tarjetaSinFecha = page.getByRole('region', { name: 'Por hacer' }).locator('article').filter({ hasText: tarea });
  await expect(tarjetaSinFecha.getByTestId('due-date-badge')).not.toBeVisible();
});
