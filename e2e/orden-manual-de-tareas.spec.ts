import { expect, test } from './limpieza.js';
import type { Locator, Page } from '@playwright/test';

/**
 * Escenario 8 — orden manual de tareas dentro de una columna (SL-15).
 *
 * El arrastre entre columnas ya estaba cubierto por `arrastre-de-tarjetas.spec.ts`.
 * Lo que se verifica aquí es la reordenación vertical dentro de una misma columna:
 *
 * 1. En una columna con orden manual (`sort = 'manual'`), mover una tarjeta sobre
 *    otra persiste el nuevo orden mediante posición fraccionaria (`PATCH /tasks/:id/reorder`)
 *    y sobrevive a una recarga completa del navegador.
 *
 * 2. En una columna con orden automático (`sort != 'manual'`), el reordenado vertical
 *    queda estrictamente deshabilitado en la interfaz, se muestra un aviso explicativo
 *    visible y cualquier intento de arrastre dentro de la columna no altera el orden.
 */

async function arrastrarSobre(page: Page, tarjeta: Locator, destino: Locator): Promise<void> {
  const origen = await tarjeta.boundingBox();
  const caja = await destino.boundingBox();
  if (!origen || !caja) throw new Error('sin geometría para arrastrar');

  await page.mouse.move(origen.x + origen.width / 2, origen.y + origen.height / 2);
  await page.mouse.down();
  // El primer movimiento pequeño cruza el umbral de activación de 6 px de MouseSensor.
  await page.mouse.move(origen.x + origen.width / 2 + 12, origen.y + origen.height / 2, { steps: 4 });
  // Mover directamente al centro de la tarjeta de destino para que `closestCenter`
  // la resuelva como `over`.
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2, { steps: 20 });
  await page.mouse.up();
}

test('el orden manual dentro de una columna sobrevive a la recarga', async ({ page }) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E orden manual ${sufijo}`;
  const tarea1 = `Tarea Alfa ${sufijo}`;
  const tarea2 = `Tarea Beta ${sufijo}`;

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

  const porHacer = page.getByRole('region', { name: 'Por hacer' });

  // Las columnas recién creadas nacen con `sort = 'manual'` (0007).
  await expect(porHacer.getByLabel('Ordenar Por hacer por')).toHaveValue('manual');

  // --- Crear dos tareas en «Por hacer» ---
  await porHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
  const dialogoTarea1 = page.getByRole('dialog');
  await dialogoTarea1.getByLabel('Título').fill(tarea1);
  await dialogoTarea1.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(porHacer.getByText(tarea1)).toBeVisible();

  await porHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
  const dialogoTarea2 = page.getByRole('dialog');
  await dialogoTarea2.getByLabel('Título').fill(tarea2);
  await dialogoTarea2.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(porHacer.getByText(tarea2)).toBeVisible();

  // Orden inicial: tarea1 arriba, tarea2 abajo.
  await expect(porHacer.locator('article h4')).toHaveText([tarea1, tarea2]);

  // --- Arrastrar la segunda tarjeta por encima de la primera ---
  const tarjeta1 = porHacer.locator('article').filter({ hasText: tarea1 });
  const tarjeta2 = porHacer.locator('article').filter({ hasText: tarea2 });

  await arrastrarSobre(page, tarjeta2, tarjeta1);

  // La reordenación se refleja en pantalla de inmediato.
  await expect(porHacer.locator('article h4')).toHaveText([tarea2, tarea1]);

  await page.reload();
  const porHacerRecargada = page.getByRole('region', { name: 'Por hacer' });
  await expect(porHacerRecargada.locator('article h4')).toHaveText([tarea2, tarea1]);
});

test('una columna con orden automatico explica por que no se reordena y bloquea el arrastre interno', async ({
  page,
}) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E orden auto ${sufijo}`;
  const tarea1 = `Tarea Alfa ${sufijo}`;
  const tarea2 = `Tarea Beta ${sufijo}`;

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

  const porHacer = page.getByRole('region', { name: 'Por hacer' });

  // Configurar la columna con orden automatico (por fecha de creacion)
  await porHacer.getByLabel('Ordenar Por hacer por').selectOption('created_asc');

  // 1. Comprobar que el aviso explicativo esta visible en la columna.
  await expect(
    porHacer.getByText('Ordenada por fecha — cambia el orden a manual para reordenar'),
  ).toBeVisible();

  // --- Crear dos tareas en «Por hacer» ---
  await porHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
  const dialogoTarea1 = page.getByRole('dialog');
  await dialogoTarea1.getByLabel('Título').fill(tarea1);
  await dialogoTarea1.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(porHacer.getByText(tarea1)).toBeVisible();

  await porHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
  const dialogoTarea2 = page.getByRole('dialog');
  await dialogoTarea2.getByLabel('Título').fill(tarea2);
  await dialogoTarea2.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(porHacer.getByText(tarea2)).toBeVisible();

  // 2. Orden inicial determinado por la fecha de creacion.
  await expect(porHacer.locator('article h4')).toHaveText([tarea1, tarea2]);

  // 3. Intentar arrastrar la segunda tarjeta por encima de la primera.
  const tarjeta1 = porHacer.locator('article').filter({ hasText: tarea1 });
  const tarjeta2 = porHacer.locator('article').filter({ hasText: tarea2 });

  await arrastrarSobre(page, tarjeta2, tarjeta1);

  // No debe cambiar el orden en pantalla ni emitir peticiones de reordenacion.
  await expect(porHacer.locator('article h4')).toHaveText([tarea1, tarea2]);

  // 4. Tras recargar, el orden permanece exactamente igual.
  await page.reload();
  const porHacerRecargada = page.getByRole('region', { name: 'Por hacer' });
  await expect(
    porHacerRecargada.getByText('Ordenada por fecha — cambia el orden a manual para reordenar'),
  ).toBeVisible();
  await expect(porHacerRecargada.locator('article h4')).toHaveText([tarea1, tarea2]);
});
