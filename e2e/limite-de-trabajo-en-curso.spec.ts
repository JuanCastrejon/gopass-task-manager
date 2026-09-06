import { expect, test } from './limpieza.js';

/**
 * Escenario 6 — el límite de trabajo en curso.
 *
 * Es la única regla del método kanban que el tablero impone, y la que no se
 * puede demostrar sin recorrer la cadena entera: el `CHECK` de PostgreSQL, la
 * transacción con `FOR UPDATE` que la hace resistente a dos peticiones a la
 * vez, el 409 del contrato, y la traducción a un mensaje que dice qué hacer.
 *
 * Las 85 pruebas de API ya cubren la regla; lo que solo se ve aquí es que el
 * usuario la entiende: el contador de la columna la anuncia antes de chocar y
 * el mensaje la explica cuando choca.
 */
test('el límite de trabajo en curso se anuncia, se impone y se puede liberar', async ({ page }) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E limite ${sufijo}`;

  await page.goto('/');

  // --- un proyecto con límite de 1 ---
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Nombre').fill(proyecto);
  await dialogo.getByRole('button', { name: 'Crear proyecto' }).click();

  const tarjeta = page.locator('article').filter({ hasText: proyecto });
  await tarjeta.getByRole('link', { name: /^Abrir tareas de/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: proyecto })).toBeVisible();

  // El límite es de la columna, no del proyecto: «Desarrollo» máximo 3 y «QA»
  // máximo 2 es una política que un único límite por proyecto no expresaría.
  await page.getByRole('button', { name: 'Columnas' }).click();
  const gestorColumnas = page.getByRole('dialog');
  await gestorColumnas.getByLabel('Límite de trabajo en curso de En curso').fill('1');
  await gestorColumnas.getByLabel('Nueva columna').click(); // dispara el blur que guarda
  await gestorColumnas.getByLabel('Cerrar').click();

  const enCurso = page.getByRole('region', { name: 'En curso' });
  const porHacer = page.getByRole('region', { name: 'Por hacer' });

  // --- dos tareas esperando ---
  for (const titulo of [`Primera ${sufijo}`, `Segunda ${sufijo}`]) {
    await porHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Título').fill(titulo);
    await d.getByRole('button', { name: 'Crear tarea' }).click();
    await expect(porHacer.getByText(titulo)).toBeVisible();
  }

  // El contador anuncia la capacidad ANTES de chocar con ella.
  await expect(enCurso.getByTitle('0 de un máximo de 1 en En curso')).toBeVisible();

  // --- la primera entra ---
  await page.getByRole('button', { name: `Mover "Primera ${sufijo}" a En curso` }).click();
  await expect(enCurso.getByText(`Primera ${sufijo}`)).toBeVisible();
  await expect(enCurso.getByTitle('1 de un máximo de 1 en En curso')).toBeVisible();

  // --- la segunda choca, y el mensaje dice qué hacer ---
  await page.getByRole('button', { name: `Mover "Segunda ${sufijo}" a En curso` }).click();
  await expect(page.getByRole('alert')).toContainText('límite de trabajo en curso es de 1 tarea');

  // Y no se movió: un 409 no deja el tablero a medias.
  await expect(porHacer.getByText(`Segunda ${sufijo}`)).toBeVisible();

  // --- terminar la primera libera el hueco ---
  await page.getByRole('button', { name: `Mover "Primera ${sufijo}" a Completada` }).click();
  await expect(page.getByRole('region', { name: 'Completada' }).getByText(`Primera ${sufijo}`)).toBeVisible();

  await page.getByRole('button', { name: `Mover "Segunda ${sufijo}" a En curso` }).click();
  await expect(enCurso.getByText(`Segunda ${sufijo}`)).toBeVisible();

  // --- y sobrevive a la recarga, porque la regla vive en PostgreSQL ---
  await page.reload();
  await expect(page.getByRole('region', { name: 'En curso' })).toContainText(`Segunda ${sufijo}`);
  await expect(
    page.getByRole('region', { name: 'En curso' }).getByTitle('1 de un máximo de 1 en En curso'),
  ).toBeVisible();
});
