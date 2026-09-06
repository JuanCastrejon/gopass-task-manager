import { test as base, expect, type APIRequestContext } from '@playwright/test';

/**
 * Los dos escenarios crean proyectos con nombre único porque el índice de la
 * base es `lower(btrim(name))` y un nombre fijo chocaría con un 409 en la
 * segunda ejecución. El efecto colateral es que cada corrida deja basura: tras
 * pasar los E2E, el panel mostraba 6 proyectos en vez de los 4 del seed.
 *
 * Volver a sembrar no lo arregla —`ON CONFLICT (id) DO NOTHING` no borra nada—,
 * así que la limpieza tiene que hacerla la propia prueba. Va en un `afterEach`
 * y no al final del cuerpo para que también se ejecute cuando una aserción
 * falla, que es justo cuando más basura queda.
 *
 * De paso ejercita el camino que ninguna prueba de interfaz recorre: borrar las
 * tareas primero y el proyecto después devuelve 204, y es la salida que el
 * mensaje del 409 le ofrece al usuario.
 */

const PREFIJO = 'E2E ';

interface Proyecto {
  id: string;
  name: string;
}

interface Tarea {
  id: string;
}

export async function borrarProyectosDePrueba(request: APIRequestContext): Promise<void> {
  const respuesta = await request.get('/api/projects');
  if (!respuesta.ok()) return;

  const proyectos = (await respuesta.json()) as Proyecto[];

  for (const proyecto of proyectos.filter((p) => p.name.startsWith(PREFIJO))) {
    const tareas = (await (await request.get(`/api/projects/${proyecto.id}/tasks`)).json()) as Tarea[];
    for (const tarea of tareas) {
      await request.delete(`/api/tasks/${tarea.id}`);
    }
    // Sin tareas dentro, el mismo DELETE que antes daba 409 ahora da 204.
    expect((await request.delete(`/api/projects/${proyecto.id}`)).status()).toBe(204);
  }
}

/**
 * Fixture automático y no un `afterEach` a nivel de módulo: ESM cachea este
 * archivo, así que el hook solo habría quedado registrado para el primer spec
 * que lo importara. Medido: con `afterEach`, `E2E ciclo` se limpiaba y
 * `E2E conflicto` sobrevivía. Un fixture `auto` se instancia por prueba, venga
 * del archivo que venga.
 */
export const test = base.extend<{ limpiezaDeProyectos: void }>({
  limpiezaDeProyectos: [
    async ({ request }, use) => {
      await use();
      await borrarProyectosDePrueba(request);
    },
    { auto: true },
  ],
});

export { expect };
