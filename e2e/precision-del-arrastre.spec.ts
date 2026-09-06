import { expect, test } from './limpieza.js';
import type { Locator, Page } from '@playwright/test';

/**
 * SL-20 — Precisión del arrastre entre columnas e indicador de inserción.
 *
 * Se verifica:
 * 1. La prueba principal: soltar sobre el cuarto superior de la primera tarjeta de otra
 *    columna deja la tarea de primera, con posición resultante 512 (y no 2048).
 * 2. Soltar sobre la mitad inferior de la última tarjeta la deja al final (posición 2048).
 * 3. Soltar sobre el hueco vacío de una columna sin tareas funciona y persiste.
 * 4. En columna con orden automático no aparece indicador de inserción y no muta a manual (SL-15).
 * 5. Columna con límite WIP lleno se marca como destino no válido y soltar ahí no dispara petición.
 */

async function arrastrarAPunto(
  page: Page,
  origenLoc: Locator,
  targetX: number,
  targetY: number,
): Promise<void> {
  const origen = await origenLoc.boundingBox();
  if (!origen) throw new Error('sin geometría de origen para arrastrar');

  await page.mouse.move(origen.x + origen.width / 2, origen.y + origen.height / 2);
  await page.mouse.down();
  // Superar el umbral de activación de 6 px de MouseSensor
  await page.mouse.move(origen.x + origen.width / 2 + 12, origen.y + origen.height / 2, { steps: 4 });
  await page.mouse.move(targetX, targetY, { steps: 20 });
}

test('soltar sobre el cuarto superior de la primera tarjeta de otra columna la deja primera con posición 512', async ({
  page,
  request,
}) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E precision ${sufijo}`;
  const tareaYaEstaba = `Ya Estaba ${sufijo}`;
  const tareaArrastrada = `Arrastrada ${sufijo}`;

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

  const url = page.url();
  const projectId = url.split('/projects/')[1]?.split('/')[0]?.split('?')[0];
  if (!projectId) throw new Error('No se pudo determinar el projectId de la URL');

  const porHacer = page.getByRole('region', { name: 'Por hacer' });
  const enProgreso = page.getByRole('region', { name: 'En curso' });

  // 1. Crear "Ya Estaba" en "En curso" (primera tarjeta con position=1024)
  await enProgreso.getByRole('button', { name: 'Añadir tarea a En curso' }).click();
  const d1 = page.getByRole('dialog');
  await d1.getByLabel('Título').fill(tareaYaEstaba);
  await d1.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(enProgreso.getByText(tareaYaEstaba)).toBeVisible();

  // 2. Crear "Arrastrada" en "Por hacer"
  await porHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
  const d2 = page.getByRole('dialog');
  await d2.getByLabel('Título').fill(tareaArrastrada);
  await d2.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(porHacer.getByText(tareaArrastrada)).toBeVisible();

  const tarjetaYaEstaba = enProgreso.locator('article').filter({ hasText: tareaYaEstaba });
  const tarjetaArrastrada = porHacer.locator('article').filter({ hasText: tareaArrastrada });

  const cajaDestino = await tarjetaYaEstaba.boundingBox();
  if (!cajaDestino) throw new Error('sin geometría de tarjeta destino');

  // Arrastrar hasta el CUARTO SUPERIOR (y = top + height * 0.25)
  const targetX = cajaDestino.x + cajaDestino.width / 2;
  const targetY = cajaDestino.y + cajaDestino.height * 0.25;

  await arrastrarAPunto(page, tarjetaArrastrada, targetX, targetY);

  // El indicador de inserción debe estar visible antes de soltar
  await expect(page.getByTestId('indicador-insercion')).toBeVisible();

  // Soltar
  await page.mouse.up();

  // Comprobar orden visible en pantalla: Arrastrada debe estar ANTES de Ya Estaba
  await expect(enProgreso.locator('article h4')).toHaveText([tareaArrastrada, tareaYaEstaba]);

  // Verificar la posición calculada por el servidor: debe ser 512 y NO 2048
  await expect.poll(async () => {
    const resp = await request.get(`/api/projects/${projectId}/tasks`);
    const tareas = (await resp.json()) as Array<{ title: string; position: number; columnId: string }>;
    const tArrastrada = tareas.find((t) => t.title === tareaArrastrada);
    return tArrastrada?.position;
  }).toBe(512);

  // Sobrevive a la recarga completa
  await page.reload();
  const enProgresoRecargada = page.getByRole('region', { name: 'En curso' });
  await expect(enProgresoRecargada.locator('article h4')).toHaveText([tareaArrastrada, tareaYaEstaba]);
});

test('soltar sobre la mitad inferior de la última tarjeta de otra columna la deja al final con posición 2048', async ({
  page,
  request,
}) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E inferior ${sufijo}`;
  const tareaYaEstaba = `Ya Estaba ${sufijo}`;
  const tareaArrastrada = `Arrastrada ${sufijo}`;

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

  const url = page.url();
  const projectId = url.split('/projects/')[1]?.split('/')[0]?.split('?')[0];
  if (!projectId) throw new Error('No se pudo determinar el projectId');

  const porHacer = page.getByRole('region', { name: 'Por hacer' });
  const enProgreso = page.getByRole('region', { name: 'En curso' });

  // 1. Crear "Ya Estaba" en "En curso"
  await enProgreso.getByRole('button', { name: 'Añadir tarea a En curso' }).click();
  const d1 = page.getByRole('dialog');
  await d1.getByLabel('Título').fill(tareaYaEstaba);
  await d1.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(enProgreso.getByText(tareaYaEstaba)).toBeVisible();

  // 2. Crear "Arrastrada" en "Por hacer"
  await porHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
  const d2 = page.getByRole('dialog');
  await d2.getByLabel('Título').fill(tareaArrastrada);
  await d2.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(porHacer.getByText(tareaArrastrada)).toBeVisible();

  const tarjetaYaEstaba = enProgreso.locator('article').filter({ hasText: tareaYaEstaba });
  const tarjetaArrastrada = porHacer.locator('article').filter({ hasText: tareaArrastrada });

  const cajaDestino = await tarjetaYaEstaba.boundingBox();
  if (!cajaDestino) throw new Error('sin geometría de tarjeta destino');

  // Arrastrar hasta la MITAD INFERIOR (y = top + height * 0.75)
  const targetX = cajaDestino.x + cajaDestino.width / 2;
  const targetY = cajaDestino.y + cajaDestino.height * 0.75;

  await arrastrarAPunto(page, tarjetaArrastrada, targetX, targetY);
  await expect(page.getByTestId('indicador-insercion')).toBeVisible();
  await page.mouse.up();

  // Comprobar orden visible en pantalla: Ya Estaba primero, Arrastrada al final
  await expect(enProgreso.locator('article h4')).toHaveText([tareaYaEstaba, tareaArrastrada]);

  // Verificar la posición calculada: debe ser 2048 (MAX + 1024)
  await expect.poll(async () => {
    const resp = await request.get(`/api/projects/${projectId}/tasks`);
    const tareas = (await resp.json()) as Array<{ title: string; position: number; columnId: string }>;
    const tArrastrada = tareas.find((t) => t.title === tareaArrastrada);
    return tArrastrada?.position;
  }).toBe(2048);
});

test('soltar sobre el hueco vacío de una columna sin tareas funciona y persiste', async ({
  page,
}) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E vacia ${sufijo}`;
  const tarea = `Mover a vacía ${sufijo}`;

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

  const porHacer = page.getByRole('region', { name: 'Por hacer' });
  const enProgreso = page.getByRole('region', { name: 'En curso' });

  // "En curso" está vacía inicialmente
  await expect(enProgreso.getByText('Sin tareas')).toBeVisible();

  await porHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Título').fill(tarea);
  await d.getByRole('button', { name: 'Crear tarea' }).click();

  const tarjeta = porHacer.locator('article').filter({ hasText: tarea });
  const cajaProgreso = await enProgreso.boundingBox();
  if (!cajaProgreso) throw new Error('sin geometría de columna En curso');

  await arrastrarAPunto(page, tarjeta, cajaProgreso.x + cajaProgreso.width / 2, cajaProgreso.y + 150);
  await page.mouse.up();

  await expect(enProgreso.getByText(tarea)).toBeVisible();
  await expect(porHacer.getByText(tarea)).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('region', { name: 'En curso' }).getByText(tarea)).toBeVisible();
});

test('en una columna con orden automático no aparece indicador de inserción y no cambia a manual', async ({
  page,
}) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E auto orden ${sufijo}`;
  const tarea1 = `Auto Tarea 1 ${sufijo}`;
  const tarea2 = `Auto Tarea 2 ${sufijo}`;

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

  const porHacer = page.getByRole('region', { name: 'Por hacer' });
  const enProgreso = page.getByRole('region', { name: 'En curso' });

  // Crear una tarea en Por hacer
  await porHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
  const d1 = page.getByRole('dialog');
  await d1.getByLabel('Título').fill(tarea1);
  await d1.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(porHacer.getByText(tarea1)).toBeVisible();

  // Crear una tarea en En curso
  await enProgreso.getByRole('button', { name: 'Añadir tarea a En curso' }).click();
  const d2 = page.getByRole('dialog');
  await d2.getByLabel('Título').fill(tarea2);
  await d2.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(enProgreso.getByText(tarea2)).toBeVisible();

  // Cambiar Por hacer a orden automático (por prioridad)
  await porHacer.getByLabel('Ordenar Por hacer por').selectOption('priority_desc');

  const tarjetaEnProgreso = enProgreso.locator('article').filter({ hasText: tarea2 });
  const tarjetaPorHacer = porHacer.locator('article').filter({ hasText: tarea1 });
  const cajaPorHacer = await tarjetaPorHacer.boundingBox();
  if (!cajaPorHacer) throw new Error('sin geometría');

  // Arrastrar desde En curso hacia una tarjeta en Por hacer
  await arrastrarAPunto(page, tarjetaEnProgreso, cajaPorHacer.x + cajaPorHacer.width / 2, cajaPorHacer.y + 20);

  // En una columna con orden automático NO debe aparecer el indicador de inserción
  await expect(page.getByTestId('indicador-insercion')).toHaveCount(0);

  // Soltar la tarjeta
  await page.mouse.up();

  // La columna NO debe mutar a manual (SL-15 se mantiene intacto)
  await expect(porHacer.getByLabel('Ordenar Por hacer por')).toHaveValue('priority_desc');
});

test('columna con límite WIP lleno se marca como destino no válido y soltar ahí no dispara peticiones', async ({
  page,
}) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E wip arrastre ${sufijo}`;
  const tarea1 = `Tarea En Progreso ${sufijo}`;
  const tarea2 = `Tarea Por Hacer ${sufijo}`;

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

  const porHacer = page.getByRole('region', { name: 'Por hacer' });
  const enProgreso = page.getByRole('region', { name: 'En curso' });

  // Configurar límite de 1 en «En curso»
  await page.getByRole('button', { name: 'Columnas' }).click();
  const gestorColumnas = page.getByRole('dialog');
  const inputWip = gestorColumnas.getByLabel('Límite de trabajo en curso de En curso');
  const patchPromise = page.waitForResponse(
    (resp) => resp.url().includes('/columns/') && resp.request().method() === 'PATCH' && resp.status() === 200,
  );
  await inputWip.fill('1');
  await inputWip.blur();
  await patchPromise;
  await gestorColumnas.getByLabel('Cerrar').click();

  // 1. Crear tarea en En curso (llena el límite 1/1)
  await enProgreso.getByRole('button', { name: 'Añadir tarea a En curso' }).click();
  const d1 = page.getByRole('dialog');
  await d1.getByLabel('Título').fill(tarea1);
  await d1.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(enProgreso.getByText(tarea1)).toBeVisible();
  await expect(enProgreso.getByText('1/1')).toBeVisible();

  // 2. Crear tarea en Por hacer
  await porHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
  const d2 = page.getByRole('dialog');
  await d2.getByLabel('Título').fill(tarea2);
  await d2.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(porHacer.getByText(tarea2)).toBeVisible();

  const tarjeta2 = porHacer.locator('article').filter({ hasText: tarea2 });
  const cajaProgreso = await enProgreso.boundingBox();
  if (!cajaProgreso) throw new Error('sin geometría de En curso');

  // Arrastrar sobre la columna llena
  await arrastrarAPunto(page, tarjeta2, cajaProgreso.x + cajaProgreso.width / 2, cajaProgreso.y + 120);

  // Se debe marcar visualmente como destino no válido
  await expect(page.getByText(/destino no válido/i)).toBeVisible();

  // Escuchar si hay alguna petición de modificación de tareas durante el soltado
  let peticionDisparada = false;
  page.on('request', (req) => {
    if (req.method() === 'PATCH' && req.url().includes('/api/tasks/')) {
      peticionDisparada = true;
    }
  });

  // Soltar en la columna llena
  await page.mouse.up();

  // No debe emitirse ninguna petición HTTP
  expect(peticionDisparada).toBe(false);

  // Se muestra un aviso visible
  await expect(page.getByRole('alert')).toContainText('ha alcanzado su límite de trabajo en curso (1)');

  // La tarea no se movió: sigue en Por hacer
  await expect(porHacer.getByText(tarea2)).toBeVisible();
  await expect(enProgreso.getByText(tarea2)).toHaveCount(0);
});
