import { expect, test } from './limpieza.js';

/**
 * Escenario 7 — columnas configurables y orden por columna.
 *
 * Lo que solo se demuestra aquí es la cadena entera: que una columna creada
 * desde la interfaz aparece en el tablero, que las tareas se mueven a ella con
 * los controles reales, y que el criterio de orden se guarda en el servidor y
 * sobrevive a una recarga —no en el navegador de quien lo eligió—.
 *
 * Las 110 pruebas de API ya cubren las reglas; esto cubre que el usuario pueda
 * ejercerlas.
 */
test('crear una columna, moverle una tarea y ordenarla, y que todo sobreviva a la recarga', async ({
  page,
}) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E columnas ${sufijo}`;

  await page.goto('/');

  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Nombre').fill(proyecto);
  await dialogo.getByRole('button', { name: 'Crear proyecto' }).click();

  await page
    .locator('article')
    .filter({ hasText: proyecto })
    .getByRole('link', { name: /^Abrir tareas de/ })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: proyecto })).toBeVisible();

  // --- el tablero nace con las tres columnas por defecto ---
  for (const nombre of ['Por hacer', 'En curso', 'Completada']) {
    await expect(page.getByRole('region', { name: nombre })).toBeVisible();
  }

  // --- se añade una cuarta desde la gestión de columnas ---
  await page.getByRole('button', { name: 'Columnas' }).click();
  const gestor = page.getByRole('dialog');
  await gestor.getByLabel('Nueva columna').fill('En revisión');
  await gestor.getByLabel('Tipo').selectOption('IN_PROGRESS');
  await gestor.getByRole('button', { name: 'Añadir' }).click();

  // El límite es propio de cada columna, no del proyecto.
  await gestor.getByLabel('Límite de trabajo en curso de En revisión').fill('1');
  await gestor.getByLabel('Nueva columna').click(); // dispara el blur que guarda
  await gestor.getByLabel('Cerrar').click();

  const revision = page.getByRole('region', { name: 'En revisión' });
  await expect(revision).toBeVisible();

  // --- una tarea, y se lleva hasta la columna nueva con las flechas ---
  const porHacer = page.getByRole('region', { name: 'Por hacer' });
  await porHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
  const dialogoTarea = page.getByRole('dialog');
  await dialogoTarea.getByLabel('Título').fill(`Revisar contrato ${sufijo}`);
  await dialogoTarea.getByRole('button', { name: 'Crear tarea' }).click();

  const tarea = `Revisar contrato ${sufijo}`;
  await expect(porHacer.getByText(tarea)).toBeVisible();

  // Las flechas ahora son contiguas por POSICIÓN, no por un mapa fijo de
  // estados: llevan de «Por hacer» a «En curso» y de ahí a «Completada».
  await page.getByRole('button', { name: `Mover "${tarea}" a En curso` }).click();
  await expect(page.getByRole('region', { name: 'En curso' }).getByText(tarea)).toBeVisible();

  // --- el salto directo a una columna no contigua va por el diálogo ---
  await page.getByRole('button', { name: `Editar ${tarea}` }).click();
  // Por id y no por etiqueta: el diálogo de creación vive en el DOM aunque
  // esté cerrado, y `getByLabel` dentro de `getByRole('dialog')` se vuelve
  // ambiguo entre los dos formularios.
  await page.locator('#task-column').selectOption({ label: 'En revisión' });
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(revision.getByText(tarea)).toBeVisible();
  // Y el contador de la columna anuncia su capacidad.
  await expect(revision.getByTitle('1 de un máximo de 1 en En revisión')).toBeVisible();

  // --- el orden se guarda en la columna, así que sobrevive a la recarga ---
  await porHacer.getByLabel('Ordenar Por hacer por').selectOption('created_asc');
  await page.reload();

  await expect(
    page.getByRole('region', { name: 'Por hacer' }).getByLabel('Ordenar Por hacer por'),
  ).toHaveValue('created_asc');
  await expect(page.getByRole('region', { name: 'En revisión' }).getByText(tarea)).toBeVisible();
});

test('eliminar una columna con tareas obliga a decir a dónde van', async ({ page }) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E borrado columna ${sufijo}`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  await page.getByRole('dialog').getByLabel('Nombre').fill(proyecto);
  await page.getByRole('dialog').getByRole('button', { name: 'Crear proyecto' }).click();

  await page
    .locator('article')
    .filter({ hasText: proyecto })
    .getByRole('link', { name: /^Abrir tareas de/ })
    .click();

  // Se borra una columna AÑADIDA, no una de las tres iniciales: «Por hacer» es
  // la única de su categoría y el propio dominio impide eliminarla —sin cola de
  // entrada el tablero deja de ser un flujo—. Esa regla tiene su propia prueba
  // más abajo.
  await page.getByRole('button', { name: 'Columnas' }).click();
  const gestor = page.getByRole('dialog');
  await gestor.getByLabel('Nueva columna').fill('QA');
  await gestor.getByLabel('Tipo').selectOption('IN_PROGRESS');
  await gestor.getByRole('button', { name: 'Añadir' }).click();
  await gestor.getByLabel('Cerrar').click();

  const qa = page.getByRole('region', { name: 'QA' });
  await expect(qa).toBeVisible();

  await qa.getByRole('button', { name: 'Añadir tarea a QA' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Título').fill(`Una tarea ${sufijo}`);
  await d.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(qa.getByText(`Una tarea ${sufijo}`)).toBeVisible();

  await page.getByRole('button', { name: 'Columnas' }).click();
  const gestor2 = page.getByRole('dialog');
  await gestor2.getByRole('button', { name: 'Eliminar QA' }).click();

  // Mismo criterio que borrar un proyecto con tareas: no hay cascada sobre
  // trabajo ajeno, pero tampoco un callejón sin salida.
  await expect(gestor2.getByText(/tiene 1 tarea/)).toBeVisible();
  await gestor2.getByLabel('Columna de destino').selectOption({ label: 'Completada' });
  await gestor2.getByRole('button', { name: 'Mover y eliminar' }).click();
  await gestor2.getByLabel('Cerrar').click();

  // La tarea sobrevivió, en la columna de destino, y marcada como completada
  // porque esa columna es terminal.
  await expect(page.getByRole('region', { name: 'QA' })).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Completada' }).getByText(`Una tarea ${sufijo}`),
  ).toBeVisible();
});

test('no se puede eliminar la última columna de una categoría', async ({ page }) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E ultima columna ${sufijo}`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  await page.getByRole('dialog').getByLabel('Nombre').fill(proyecto);
  await page.getByRole('dialog').getByRole('button', { name: 'Crear proyecto' }).click();

  await page
    .locator('article')
    .filter({ hasText: proyecto })
    .getByRole('link', { name: /^Abrir tareas de/ })
    .click();

  await page.getByRole('button', { name: 'Columnas' }).click();
  const gestor = page.getByRole('dialog');
  await gestor.getByRole('button', { name: 'Eliminar Completada' }).click();

  // Sin columna terminal no habría forma de dar nada por terminado, ni de que
  // el motor sellara la fecha de completado.
  await expect(gestor.getByRole('alert')).toContainText('última columna');
  await gestor.getByLabel('Cerrar').click();
  await expect(page.getByRole('region', { name: 'Completada' })).toBeVisible();
});
