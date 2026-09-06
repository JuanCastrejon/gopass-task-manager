import { expect, test } from './limpieza.js';

/**
 * Escenario 12 — Fondo de tablero por proyecto (SL-19 paso 3).
 *
 * Se verifica que el fondo del tablero:
 * 1. Nace con el valor neutro por defecto dejando la aplicación como está hoy.
 * 2. Se puede cambiar desde el diálogo de edición del proyecto a otro fondo de la paleta cerrada.
 * 3. Persiste en base de datos tras recargar la página (identidad compartida del tablero).
 * 4. Aplica la clase correspondiente (bg-board-verde) a sangre sobre el área del tablero.
 */
test('cambiar el fondo de un proyecto, recargar y comprobar que persiste', async ({
  page,
}) => {
  const sufijo = Date.now().toString(36);
  const nombreProyecto = `E2E Fondo ${sufijo}`;

  await page.goto('/');

  // 1. Crear nuevo proyecto
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialogoCrear = page.getByRole('dialog');
  await dialogoCrear.getByLabel('Nombre').fill(nombreProyecto);

  // Por defecto el radio 'Neutro' está seleccionado
  const radioNeutro = dialogoCrear.getByRole('radio', { name: 'Neutro' });
  await expect(radioNeutro).toHaveAttribute('aria-checked', 'true');

  await dialogoCrear.getByRole('button', { name: 'Crear proyecto' }).click();

  // 2. Navegar al detalle del proyecto recién creado
  await page
    .locator('article')
    .filter({ hasText: nombreProyecto })
    .getByRole('link', { name: /^Abrir tareas de/ })
    .click();

  await expect(page.getByRole('heading', { level: 1, name: nombreProyecto })).toBeVisible();

  // El área del tablero tiene inicialmente el fondo neutro
  const areaTablero = page.getByTestId('project-board-area');
  await expect(areaTablero).toBeVisible();
  await expect(areaTablero).toHaveClass(/bg-board-neutro/);

  // 3. Abrir diálogo de edición de proyecto
  await page.getByRole('button', { name: 'Editar proyecto' }).click();
  const dialogoEditar = page.getByRole('dialog');
  await expect(dialogoEditar).toBeVisible();

  // Cambiar el fondo a Verde
  const radioVerde = dialogoEditar.getByRole('radio', { name: 'Verde' });
  await radioVerde.click();
  await expect(radioVerde).toHaveAttribute('aria-checked', 'true');

  // Guardar cambios
  await dialogoEditar.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(dialogoEditar).not.toBeVisible();

  // 4. Comprobar que el tablero refleja inmediatamente el fondo verde
  await expect(areaTablero).toHaveClass(/bg-board-verde/);

  // 5. Recargar la página y comprobar que persiste desde la base de datos
  await page.reload();

  const areaTrasRecarga = page.getByTestId('project-board-area');
  await expect(areaTrasRecarga).toBeVisible();
  await expect(areaTrasRecarga).toHaveClass(/bg-board-verde/);
});
