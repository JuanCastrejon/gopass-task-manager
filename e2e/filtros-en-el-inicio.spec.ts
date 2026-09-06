import { expect, test } from './limpieza.js';

/**
 * Escenario 5 — los filtros del panel de proyectos.
 *
 * Lo que solo se puede demostrar aquí es la cadena entera: que el conteo por
 * prioridad que pinta la tarjeta viene del `FILTER` de PostgreSQL, que el chip
 * filtra por él, y que el estado del filtro sobrevive a una recarga porque vive
 * en la URL. Las pruebas de componente simulan la API; esta no.
 *
 * Nombre único por ejecución: el índice de la base es `lower(btrim(name))` y el
 * fixture de limpieza borra lo que empiece por «E2E ».
 */
test('los filtros del inicio aíslan proyectos por prioridad y sobreviven a la recarga', async ({
  page,
}) => {
  const sufijo = Date.now().toString(36);
  const conAlta = `E2E filtros alta ${sufijo}`;
  const conBaja = `E2E filtros baja ${sufijo}`;

  await page.goto('/');

  // --- dos proyectos, cada uno con una tarea de distinta prioridad ---
  for (const [proyecto, prioridad] of [
    [conAlta, 'HIGH'],
    [conBaja, 'LOW'],
  ] as const) {
    await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Nombre').fill(proyecto);
    await dialogo.getByRole('button', { name: 'Crear proyecto' }).click();

    const tarjeta = page.locator('article').filter({ hasText: proyecto });
    await tarjeta.getByRole('link', { name: 'Ver tareas' }).click();

    await page.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
    const dialogoTarea = page.getByRole('dialog');
    await dialogoTarea.getByLabel('Título').fill(`Tarea ${prioridad} ${sufijo}`);
    await dialogoTarea.getByLabel('Prioridad').selectOption(prioridad);
    await dialogoTarea.getByRole('button', { name: 'Crear tarea' }).click();

    await page.getByRole('link', { name: 'Volver a proyectos' }).click();
  }

  const tarjetaAlta = page.locator('article').filter({ hasText: conAlta });
  const tarjetaBaja = page.locator('article').filter({ hasText: conBaja });

  // El desglose de la tarjeta sale del agregado de PostgreSQL, no del cliente.
  await expect(tarjetaAlta.getByLabel('Alta: 1 tarea')).toBeVisible();
  await expect(tarjetaBaja.getByLabel('Baja: 1 tarea')).toBeVisible();

  // --- el chip filtra por «tiene al menos una tarea de esa prioridad» ---
  await page.getByRole('group', { name: /Filtrar proyectos/ }).getByRole('button', { name: 'Alta' }).click();

  await expect(tarjetaAlta).toBeVisible();
  await expect(tarjetaBaja).toBeHidden();
  await expect(page).toHaveURL(/priority=HIGH/);

  // --- combinado con la búsqueda por nombre ---
  await page.getByLabel('Buscar proyectos por nombre').fill(conAlta);
  await expect(tarjetaAlta).toBeVisible();

  // El chip tiene que seguir pulsado: el temporizador del buscador escribe en
  // la URL 250 ms después, y con una versión capturada del closure se llevaría
  // por delante la prioridad recién elegida.
  await expect(page).toHaveURL(/priority=HIGH/);
  await expect(page).toHaveURL(/q=/);

  // --- LA RECARGA: el filtro vive en la URL, no en el estado de React ---
  await page.reload();

  await expect(page.getByLabel('Buscar proyectos por nombre')).toHaveValue(conAlta);
  await expect(
    page.getByRole('group', { name: /Filtrar proyectos/ }).getByRole('button', { name: 'Alta' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(tarjetaAlta).toBeVisible();
  await expect(tarjetaBaja).toBeHidden();

  // --- sin coincidencias, el vacío no invita a «crear el primero» ---
  await page.getByLabel('Buscar proyectos por nombre').fill('no existe ningún proyecto así');
  await expect(page.getByText('Ningún proyecto coincide')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear el primer proyecto' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await expect(tarjetaAlta).toBeVisible();
  await expect(tarjetaBaja).toBeVisible();
});
