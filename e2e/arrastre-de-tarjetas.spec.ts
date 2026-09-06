import { expect, test } from './limpieza.js';
import type { Locator, Page } from '@playwright/test';

/**
 * Escenario 3 — arrastrar una tarjeta entre columnas.
 *
 * Los E2E corren a 1280x720, es decir, por encima de `lg`: el tablero está en
 * modo rejilla y las tres columnas se ven a la vez. El arrastre táctil con el
 * carrusel se valida a mano en un teléfono; aquí se comprueba la lógica, que
 * es la misma en los dos modos.
 *
 * `page.dragTo()` no sirve: emite un salto sin eventos intermedios y el sensor
 * de dnd-kit descarta el gesto por no superar su umbral de distancia. Hay que
 * mover en pasos.
 */
async function arrastrar(page: Page, tarjeta: Locator, destino: Locator): Promise<void> {
  const origen = await tarjeta.boundingBox();
  const caja = await destino.boundingBox();
  if (!origen || !caja) throw new Error('sin geometría para arrastrar');

  await page.mouse.move(origen.x + origen.width / 2, origen.y + origen.height / 2);
  await page.mouse.down();
  // El primer movimiento pequeño cruza el umbral de activación de 6 px; los
  // pasos siguientes son los que dnd-kit usa para calcular la colisión.
  await page.mouse.move(origen.x + origen.width / 2 + 12, origen.y + origen.height / 2, { steps: 4 });
  await page.mouse.move(caja.x + caja.width / 2, caja.y + 80, { steps: 20 });
  await page.mouse.up();
}

test('arrastrar una tarjeta a otra columna cambia su estado y sobrevive a la recarga', async ({ page }) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E arrastre ${sufijo}`;
  const tarea = `Homologar lector ${sufijo}`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Nombre').fill(proyecto);
  await dialogo.getByRole('button', { name: 'Crear proyecto' }).click();

  await page.locator('article').filter({ hasText: proyecto }).getByRole('link', { name: /^Abrir tareas de/ }).click();

  const porHacer = page.getByRole('region', { name: 'Por hacer' });
  await porHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
  const dialogoTarea = page.getByRole('dialog');
  await dialogoTarea.getByLabel('Título').fill(tarea);
  await dialogoTarea.getByRole('button', { name: 'Crear tarea' }).click();

  const tarjeta = page.locator('article').filter({ hasText: tarea });
  await expect(porHacer.getByText(tarea)).toBeVisible();

  // --- de «Por hacer» directamente a «Completada» ---
  // Las flechas solo ofrecen la transición contigua; el arrastre permite
  // cualquier columna, y el dominio no lo prohíbe.
  const completada = page.getByRole('region', { name: 'Completada' });
  await arrastrar(page, tarjeta, completada);

  await expect(completada.getByText(tarea)).toBeVisible();
  await expect(porHacer.getByText(tarea)).toHaveCount(0);

  // Lo que importa: que el cambio esté en PostgreSQL y no solo en la pantalla.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Completada' }).getByText(tarea)).toBeVisible();
  await expect(page.getByText('1 de 1 completadas')).toBeVisible();
});

test('soltar una tarjeta fuera de una columna la devuelve a su sitio', async ({ page }) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E retorno ${sufijo}`;
  const tarea = `Conciliar recaudo ${sufijo}`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Nombre').fill(proyecto);
  await dialogo.getByRole('button', { name: 'Crear proyecto' }).click();

  await page.locator('article').filter({ hasText: proyecto }).getByRole('link', { name: /^Abrir tareas de/ }).click();

  const porHacer = page.getByRole('region', { name: 'Por hacer' });
  await porHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
  const dialogoTarea = page.getByRole('dialog');
  await dialogoTarea.getByLabel('Título').fill(tarea);
  await dialogoTarea.getByRole('button', { name: 'Crear tarea' }).click();

  const tarjeta = page.locator('article').filter({ hasText: tarea });
  const caja = await tarjeta.boundingBox();
  if (!caja) throw new Error('sin geometría');

  // Se suelta sobre la cabecera de la página, que no es zona de destino.
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await page.mouse.down();
  await page.mouse.move(caja.x + caja.width / 2 + 12, caja.y + caja.height / 2, { steps: 4 });
  await page.mouse.move(caja.x + caja.width / 2, 40, { steps: 20 });
  await page.mouse.up();

  // Sigue donde estaba, y no se disparó ninguna petición.
  await expect(porHacer.getByText(tarea)).toBeVisible();
  await expect(page.getByText('0 de 1 completadas')).toBeVisible();
});
