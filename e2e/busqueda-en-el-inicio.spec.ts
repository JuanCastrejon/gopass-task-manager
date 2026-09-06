import { expect, test } from './limpieza.js';

/**
 * Escenario 5 — la búsqueda del panel de proyectos.
 *
 * Lo que solo se puede demostrar aquí es la cadena entera: que la señal de
 * urgencia que pinta la tarjeta viene del `FILTER` de PostgreSQL, que la
 * tarjeta entera navega, y que la búsqueda sobrevive a una recarga porque vive
 * en la URL. Las pruebas de componente simulan la API; esta no.
 *
 * Nombre único por ejecución: el índice de la base es `lower(btrim(name))` y el
 * fixture de limpieza borra lo que empiece por «E2E ».
 */
test('la búsqueda del inicio aísla proyectos por nombre y sobrevive a la recarga', async ({
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
    await tarjeta.getByRole('link', { name: /^Abrir tareas de/ }).click();

    await page.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
    const dialogoTarea = page.getByRole('dialog');
    await dialogoTarea.getByLabel('Título').fill(`Tarea ${prioridad} ${sufijo}`);
    await dialogoTarea.getByLabel('Prioridad').selectOption(prioridad);
    await dialogoTarea.getByRole('button', { name: 'Crear tarea' }).click();

    await page.getByRole('link', { name: 'Volver a proyectos' }).click();
  }

  const tarjetaAlta = page.locator('article').filter({ hasText: conAlta });
  const tarjetaBaja = page.locator('article').filter({ hasText: conBaja });

  // La señal de urgencia sale del agregado de PostgreSQL, no del cliente: el
  // proyecto con una tarea de prioridad alta la muestra, y el que solo tiene
  // una de prioridad baja no muestra nada.
  await expect(tarjetaAlta.getByLabel('Alta: 1 tarea')).toBeVisible();
  await expect(tarjetaBaja.getByLabel(/^Alta:/)).toHaveCount(0);

  // --- fuera del proyecto solo se busca por nombre ---
  await page.getByLabel('Buscar proyectos por nombre').fill(conAlta);
  await expect(tarjetaAlta).toBeVisible();
  await expect(tarjetaBaja).toBeHidden();
  await expect(page).toHaveURL(/q=/);

  // --- LA RECARGA: la búsqueda vive en la URL, no en el estado de React ---
  await page.reload();

  await expect(page.getByLabel('Buscar proyectos por nombre')).toHaveValue(conAlta);
  await expect(tarjetaAlta).toBeVisible();
  await expect(tarjetaBaja).toBeHidden();

  // --- sin coincidencias, el vacío no invita a «crear el primero» ---
  await page.getByLabel('Buscar proyectos por nombre').fill('no existe ningún proyecto así');
  await expect(page.getByText('Ningún proyecto coincide')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear el primer proyecto' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
  await expect(tarjetaAlta).toBeVisible();
  await expect(tarjetaBaja).toBeVisible();

  // --- la tarjeta entera abre el proyecto, no solo el enlace del pie ---
  // Se pulsa sobre la descripción, que es el punto donde fallaban las dos
  // alternativas descartadas: con un pseudo-elemento estirado el texto no
  // recibe el puntero, y al subirlo por encima esa franja dejaba de navegar.
  await tarjetaAlta.getByText('Sin descripción').click();
  await expect(page.getByRole('heading', { level: 1, name: conAlta })).toBeVisible();
});
