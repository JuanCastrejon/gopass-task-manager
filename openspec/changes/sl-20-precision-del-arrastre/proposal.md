# Proposal: SL-20 — Precisión del arrastre entre columnas e indicador de inserción

## Why

El arrastre entre columnas no permitía elegir la posición: una tarjeta soltada sobre la primera
tarea de otra lista aterrizaba siempre la última. En un tablero donde el orden manual comunica
prioridad de trabajo, eso obliga a un segundo gesto correctivo dentro de la columna destino.

El defecto es interesante porque **la funcionalidad ya existía y era inalcanzable**. El manejador
de soltado calculaba correctamente las vecinas cuando el objetivo era una tarjeta; simplemente esa
rama nunca se ejecutaba.

## What Changes

- **WP1 — Diagnóstico medido:** se reprodujo con una prueba temporal soltando sobre el cuarto
  superior de la única tarjeta del destino. La posición resultante delata la rama ejecutada:

  | | Antes | Después |
  |---|---|---|
  | Orden | `["YA_ESTABA","ARRASTRADA"]` | `["ARRASTRADA","YA_ESTABA"]` |
  | Posiciones | 1024 / **2048** | **512** / 1024 |

  `2048` es `MAX+1024`, la fórmula de la rama de columna. Luego `over.id` se resolvía a la columna
  y no a la tarjeta. La causa raíz era `collisionDetection={closestCenter}`: en una columna con
  pocas tarjetas, el centro del contenedor queda más cerca del puntero que el de su única tarjeta.

- **WP2 — Detector compuesto (`web/src/features/tasks/collision.ts`):** `pointerWithin` acotado a
  los contenedores de columna para identificar sobre cuál está el puntero, después acotado a las
  tarjetas de esa columna, y caída al contenedor solo si no sobrevuela ninguna.
- **WP3 — Indicador de inserción visible:** línea que sigue al puntero, antes y después de cada
  tarjeta. Solo en columnas con orden `manual`; en las automáticas no aparece, porque allí la
  posición no se puede elegir.
- **WP4 — Límite de trabajo en curso:** una columna llena se marca como destino no válido y soltar
  ahí no dispara una petición condenada al fallo. La validación del servidor se mantiene para las
  carreras.
- **WP5 — Pruebas:** 5 escenarios E2E en `e2e/precision-del-arrastre.spec.ts` y unitarias del
  detector en `web/src/features/tasks/__tests__/collision.test.ts`.

## Impact

- **Capacidades afectadas:** `tasks-board-web`. **El backend no cambia**: el endpoint
  `PATCH /api/tasks/:id/reorder` ya aceptaba `{ columnId, previousTaskId, nextTaskId }`.
- **ADR-024 y SL-15 intactos:** soltar en una columna con orden automático nunca la convierte a
  manual, y hay una prueba E2E que lo fija.
- **Lección de proceso:** una prueba unitaria del cálculo de vecinas habría pasado igual. Solo un
  gesto real sobre el navegador revela una funcionalidad correcta pero inalcanzable.
