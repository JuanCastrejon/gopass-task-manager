import { expect, test } from './limpieza.js';

/**
 * Escenario 8 — Renombrar una columna desde la cabecera del tablero (SL-21).
 *
 * Demuestra la cadena completa:
 * 1. Renombrar con pulsación simple sobre el título conmuta al input con foco y texto seleccionado.
 * 2. Guardar con Enter envía PATCH al servidor, restaura el botón y el nuevo nombre sobrevive a la recarga.
 * 3. Renombrar con un nombre duplicado (ej. 'Completada') provoca un 409 de la API:
 *    el campo permanece abierto con aria-invalid="true", conserva lo escrito, y el mensaje
 *    de conflicto aparece en role="alert" sin perder lo tecleado.
 */
test('renombrar una columna desde la cabecera persiste tras recargar y avisa de conflictos sin perder lo escrito', async ({
  page,
}) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E renombrar col ${sufijo}`;

  await page.goto('/');

  // 1. Crear proyecto limpio
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Nombre').fill(proyecto);
  await dialogo.getByRole('button', { name: 'Crear proyecto' }).click();

  const tarjeta = page.locator('article').filter({ hasText: proyecto });
  await tarjeta.getByRole('link', { name: /^Abrir tareas de/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: proyecto })).toBeVisible();

  // El tablero nace con 'Por hacer', 'En curso', 'Completada'
  const columnaPorHacer = page.getByRole('region', { name: 'Por hacer' });
  await expect(columnaPorHacer).toBeVisible();

  // 2. Renombrar desde la cabecera pulsando el título
  const botonTitulo = columnaPorHacer.getByRole('button', { name: 'Renombrar columna: Por hacer', exact: true });
  await botonTitulo.click();

  const input = page.getByRole('textbox', { name: 'Nombre de la columna Por hacer' });
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();

  // Escribir nuevo nombre y presionar Enter para guardar
  const nuevoNombre = `Backlog ${sufijo}`;
  await input.fill(nuevoNombre);
  await input.press('Enter');

  // Comprobar que el nombre nuevo aparece en el tablero y el botón recupera el foco
  const columnaRenombrada = page.getByRole('region', { name: nuevoNombre });
  await expect(columnaRenombrada).toBeVisible();
  const botonRenombrado = columnaRenombrada.getByRole('button', { name: `Renombrar columna: ${nuevoNombre}`, exact: true });
  await expect(botonRenombrado).toBeVisible();
  await expect(botonRenombrado).toBeFocused();

  // Comprobar que sobrevive a la recarga de página
  await page.reload();
  const columnaTrasRecarga = page.getByRole('region', { name: nuevoNombre });
  await expect(columnaTrasRecarga).toBeVisible();
  await expect(columnaTrasRecarga.getByRole('button', { name: `Renombrar columna: ${nuevoNombre}`, exact: true })).toBeVisible();

  // 3. Caso 409: intentar renombrar con un nombre ya existente en el proyecto ('Completada')
  await columnaTrasRecarga.getByRole('button', { name: `Renombrar columna: ${nuevoNombre}`, exact: true }).click();
  const inputConflicto = page.getByRole('textbox', { name: `Nombre de la columna ${nuevoNombre}` });
  await expect(inputConflicto).toBeVisible();
  await expect(inputConflicto).toBeFocused();

  await inputConflicto.fill('Completada');
  await inputConflicto.press('Enter');

  // El 409 deja el campo abierto, con aria-invalid="true", no pierde lo escrito y muestra alerta
  await expect(inputConflicto).toBeVisible();
  await expect(inputConflicto).toHaveValue('Completada');
  await expect(inputConflicto).toHaveAttribute('aria-invalid', 'true');
  await expect(inputConflicto).toBeFocused();

  const alerta = page.getByRole('alert');
  await expect(alerta).toBeVisible();
  await expect(alerta).toContainText('Completada');

  // Escape cancela restaurando el valor previo y cierra el campo
  await inputConflicto.press('Escape');
  await expect(inputConflicto).not.toBeVisible();
  await expect(columnaTrasRecarga.getByRole('button', { name: `Renombrar columna: ${nuevoNombre}`, exact: true })).toBeVisible();
});
