import { expect, test } from './limpieza.js';

/**
 * Escenario SL-16 — Completar una tarea de un clic.
 *
 * Se comprueba que el control de un clic traslada la tarea directamente a la columna
 * terminal si hay una sola DONE, o despliega el menú de destinos si hay más de una,
 * que el avance se actualiza inmediatamente en la cabecera y que el estado sobrevive
 * a la recarga completa del navegador.
 */
test('completar una tarea de un clic con una sola columna DONE sobrevive a la recarga y actualiza el avance', async ({
  page,
}) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E un clic ${sufijo}`;
  const tarea = `Facturar cliente ${sufijo}`;

  await page.goto('/');

  // --- crear el proyecto ---
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialogoProyecto = page.getByRole('dialog');
  await dialogoProyecto.getByLabel('Nombre').fill(proyecto);
  await dialogoProyecto.getByRole('button', { name: 'Crear proyecto' }).click();

  const tarjeta = page.locator('article').filter({ hasText: proyecto });
  await expect(tarjeta).toBeVisible();

  // --- entrar al detalle ---
  await tarjeta.getByRole('link', { name: /^Abrir tareas de/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: proyecto })).toBeVisible();

  // --- crear la tarea en «Por hacer» ---
  const columnaPorHacer = page.getByRole('region', { name: 'Por hacer' });
  await columnaPorHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();

  const dialogoTarea = page.getByRole('dialog');
  await dialogoTarea.getByLabel('Título').fill(tarea);
  await dialogoTarea.getByRole('button', { name: 'Crear tarea' }).click();

  await expect(columnaPorHacer.getByText(tarea)).toBeVisible();
  await expect(page.getByText('0 de 1 completadas')).toBeVisible();

  // --- completar de un clic directamente a la única columna DONE («Completada») ---
  const botonCompletar = page.getByRole('button', {
    name: `Completar "${tarea}": mover a Completada`,
  });
  await expect(botonCompletar).toBeVisible();
  await botonCompletar.click();

  // La tarea ahora debe estar en «Completada»
  const columnaCompletada = page.getByRole('region', { name: 'Completada' });
  await expect(columnaCompletada.getByText(tarea)).toBeVisible();

  // El indicador ahora informa, no se pulsa (no debe haber botón de completar)
  await expect(
    columnaCompletada.getByRole('button', { name: new RegExp(`Completar "${tarea}"`) }),
  ).toHaveCount(0);

  // El avance del proyecto sube al 100%
  await expect(page.getByText('1 de 1 completadas')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: /avance del proyecto/i })).toHaveAttribute(
    'aria-valuenow',
    '100',
  );

  // --- RECARGA: verificar que la persistencia en base de datos es real ---
  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: proyecto })).toBeVisible();
  const completadaTrasRecarga = page.getByRole('region', { name: 'Completada' });
  await expect(completadaTrasRecarga.getByText(tarea)).toBeVisible();
  await expect(page.getByText('1 de 1 completadas')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: /avance del proyecto/i })).toHaveAttribute(
    'aria-valuenow',
    '100',
  );
});

test('completar una tarea con dos columnas DONE abre el menú de selección de destino', async ({
  page,
}) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E varios DONE ${sufijo}`;
  const tarea = `Desplegar release ${sufijo}`;

  await page.goto('/');

  // --- crear el proyecto ---
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialogoProyecto = page.getByRole('dialog');
  await dialogoProyecto.getByLabel('Nombre').fill(proyecto);
  await dialogoProyecto.getByRole('button', { name: 'Crear proyecto' }).click();

  const tarjeta = page.locator('article').filter({ hasText: proyecto });
  await tarjeta.getByRole('link', { name: /^Abrir tareas de/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: proyecto })).toBeVisible();

  // --- añadir una segunda columna de categoría DONE («Desplegado») ---
  await page.getByRole('button', { name: 'Columnas' }).click();
  const gestor = page.getByRole('dialog');
  await gestor.getByLabel('Nueva columna').fill('Desplegado');
  await gestor.getByLabel('Tipo').selectOption('DONE');
  await gestor.getByRole('button', { name: 'Añadir' }).click();
  await gestor.getByLabel('Cerrar').click();

  const desplegado = page.getByRole('region', { name: 'Desplegado' });
  await expect(desplegado).toBeVisible();

  // --- crear la tarea en «Por hacer» ---
  const columnaPorHacer = page.getByRole('region', { name: 'Por hacer' });
  await columnaPorHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();

  const dialogoTarea = page.getByRole('dialog');
  await dialogoTarea.getByLabel('Título').fill(tarea);
  await dialogoTarea.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(columnaPorHacer.getByText(tarea)).toBeVisible();

  // --- pulsar el botón debe abrir el menú sin mover todavía ---
  const botonElegir = page.getByRole('button', {
    name: `Completar "${tarea}": elegir columna`,
  });
  await expect(botonElegir).toHaveAttribute('aria-haspopup', 'menu');
  await botonElegir.click();

  // El menú muestra ambas opciones de categoría DONE
  const menu = page.getByRole('menu', { name: `Destinos para completar "${tarea}"` });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Completada' })).toBeVisible();
  const opcionDesplegado = menu.getByRole('menuitem', { name: 'Desplegado' });
  await expect(opcionDesplegado).toBeVisible();

  // Elegir «Desplegado» mueve la tarea allí
  await opcionDesplegado.click();
  await expect(desplegado.getByText(tarea)).toBeVisible();
  await expect(page.getByText('1 de 1 completadas')).toBeVisible();

  // --- RECARGA ---
  await page.reload();
  const desplegadoTrasRecarga = page.getByRole('region', { name: 'Desplegado' });
  await expect(desplegadoTrasRecarga.getByText(tarea)).toBeVisible();
  await expect(page.getByText('1 de 1 completadas')).toBeVisible();
});
