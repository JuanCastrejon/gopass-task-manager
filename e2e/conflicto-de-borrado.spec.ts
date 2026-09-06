import { expect, test } from './limpieza.js';

/**
 * Escenario 2 — el 409 explicado.
 *
 * Es la decisión de diseño más interesante del proyecto (ADR-003): borrar un
 * proyecto con tareas no destruye nada, devuelve 409, y la interfaz tiene que
 * explicar por qué en vez de decir «algo salió mal».
 *
 * La prueba de integración ya comprueba que la API devuelve 409. Lo que solo
 * se puede comprobar aquí es que ese 409 **llega a los ojos del usuario** con
 * un mensaje que se entiende.
 *
 * Crea sus propios datos en vez de apoyarse en el seed: así no depende de que
 * nadie haya tocado los proyectos de demostración.
 */
test('borrar un proyecto con tareas explica el conflicto y no destruye nada', async ({ page }) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E conflicto ${sufijo}`;

  await page.goto('/');

  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialogoProyecto = page.getByRole('dialog');
  await dialogoProyecto.getByLabel('Nombre').fill(proyecto);
  await dialogoProyecto.getByRole('button', { name: 'Crear proyecto' }).click();

  const tarjeta = page.locator('article').filter({ hasText: proyecto });
  await tarjeta.getByRole('link', { name: /^Abrir tareas de/ }).click();

  // Cada columna es una región con nombre propio, así que se localiza por
  // su rol y su nombre accesible en vez de por texto suelto.
  const columnaPorHacer = page.getByRole('region', { name: 'Por hacer' });
  await columnaPorHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
  const dialogoTarea = page.getByRole('dialog');
  await dialogoTarea.getByLabel('Título').fill('Tarea que bloquea el borrado');
  await dialogoTarea.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(columnaPorHacer.getByText('Tarea que bloquea el borrado')).toBeVisible();

  // --- intentar borrar el proyecto que ya tiene una tarea ---
  await page.getByRole('button', { name: 'Eliminar proyecto' }).click();

  const confirmacion = page.getByRole('dialog');
  await expect(confirmacion).toContainText('1 tarea asociada');
  await confirmacion.getByRole('button', { name: 'Eliminar', exact: true }).click();

  // El mensaje del 409, traducido por `code`, dentro del propio diálogo.
  const aviso = confirmacion.getByRole('alert');
  await expect(aviso).toContainText('todavía tiene tareas');

  // Y lo importante: no se destruyó nada.
  await confirmacion.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: proyecto })).toBeVisible();

  await page.goto('/');
  await expect(page.locator('article').filter({ hasText: proyecto })).toBeVisible();
});
