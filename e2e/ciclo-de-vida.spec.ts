import { expect, test } from '@playwright/test';

/**
 * Escenario 1 — el ciclo completo, con recarga.
 *
 * Existe porque es lo único que las 69 pruebas de integración no pueden
 * demostrar: que lo que se ve en pantalla viene de PostgreSQL y no del estado
 * de React. La recarga en mitad del flujo es el punto entero de la prueba.
 *
 * Cada ejecución usa un nombre único: el índice de la base es
 * `lower(btrim(name))`, así que un nombre fijo devolvería 409 la segunda vez.
 */
test('una tarea creada sobrevive a la recarga en la columna a la que se movió', async ({ page }) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E ciclo ${sufijo}`;
  const tarea = `Conciliar recaudo ${sufijo}`;

  await page.goto('/');

  // --- crear el proyecto ---
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialogoProyecto = page.getByRole('dialog');
  await dialogoProyecto.getByLabel('Nombre').fill(proyecto);
  await dialogoProyecto.getByRole('button', { name: 'Crear proyecto' }).click();

  const tarjeta = page.locator('article').filter({ hasText: proyecto });
  await expect(tarjeta).toBeVisible();
  await expect(tarjeta).toContainText('Sin tareas');

  // --- entrar al detalle ---
  await tarjeta.getByRole('link', { name: 'Ver tareas' }).click();
  await expect(page.getByRole('heading', { level: 1, name: proyecto })).toBeVisible();

  // --- crear la tarea en «Por hacer» ---
  // Cada columna es una región con nombre propio, así que se localiza por
  // su rol y su nombre accesible en vez de por texto suelto.
  const columnaPorHacer = page.getByRole('region', { name: 'Por hacer' });
  await columnaPorHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();

  const dialogoTarea = page.getByRole('dialog');
  await dialogoTarea.getByLabel('Título').fill(tarea);
  await dialogoTarea.getByLabel('Prioridad').selectOption('HIGH');
  await dialogoTarea.getByRole('button', { name: 'Crear tarea' }).click();

  await expect(columnaPorHacer.getByText(tarea)).toBeVisible();

  // --- moverla hasta «Completada» ---
  await page.getByRole('button', { name: `Mover "${tarea}" a En curso` }).click();
  await page.getByRole('button', { name: `Mover "${tarea}" a Completada` }).click();

  const columnaCompletada = page.getByRole('region', { name: 'Completada' });
  await expect(columnaCompletada.getByText(tarea)).toBeVisible();

  // El avance de la cabecera tiene que haber reaccionado: es la prueba de que
  // la mutación invalidó también el proyecto, no solo la lista de tareas.
  await expect(page.getByText('1 de 1 completadas')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: /avance del proyecto/i })).toHaveAttribute(
    'aria-valuenow',
    '100',
  );

  // --- LA RECARGA: aquí se cae cualquier estado que solo viva en el cliente ---
  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: proyecto })).toBeVisible();
  const completadaTrasRecarga = page.getByRole('region', { name: 'Completada' });
  await expect(completadaTrasRecarga.getByText(tarea)).toBeVisible();
  await expect(page.getByText('1 de 1 completadas')).toBeVisible();
});
