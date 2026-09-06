# Proposal: SL-12 — Límite de trabajo en curso

## Why

El tablero tenía tres columnas y ninguna regla de flujo. Un tablero sin límite de trabajo en curso
dibuja columnas pero no gestiona nada: **el límite es la idea central del método kanban**, y lo que
hace visible el cuello de botella antes de que el trabajo se acumule.

Es también la única característica de tablero que se evaluó y entró. Se descartaron los carriles por
responsable, la definición de «Hecho» ejecutable, el tiempo de ciclo, el diagrama de flujo acumulado
y la edad de la tarjeta en su columna. Esta última parecía la más barata y resultó imposible sin
mentir: el esquema tiene `created_at`, `updated_at` y `completed_at`, pero **no** `status_changed_at`,
así que cualquier «lleva 6 días en curso» se reiniciaría al corregir una errata en el título.

## What Changes

- **WP1 — Esquema (`0002_projects_wip_limit.sql`):** `projects.wip_limit integer NULL` con
  `CHECK (wip_limit IS NULL OR wip_limit > 0)`, más el índice `(project_id, status)` que el conteo
  necesita en cada intento de mover una tarea.
- **WP2 — Regla en el repositorio:** comprobación dentro de una transacción que bloquea la fila del
  proyecto con `FOR UPDATE`, aplicada al crear una tarea en curso y al mover una hacia allí.
- **WP3 — Contrato:** `wipLimit` e `inProgressCount` en el resumen del proyecto; `wipLimit`
  aceptado en crear y en parchear; **409 `WIP_LIMIT_REACHED`** con el límite en el `detail`.
- **WP4 — Interfaz:** contador `1/2` en la cabecera de «En curso», en rojo al alcanzarse; campo
  opcional en el diálogo de proyecto; el mensaje del 409 dice qué hacer.
- **WP5 — Seed:** un proyecto con límite, para que la regla se vea al abrir la aplicación.
- **WP6 — Pruebas:** 9 de integración, incluida la de concurrencia, y 1 E2E.

## Capabilities

### New Capabilities
- `wip-limit` — limitar el trabajo simultáneo en curso de un proyecto.

### Modified Capabilities
- `projects-api` — el proyecto gana `wipLimit` e `inProgressCount`.
- `tasks-api` — entrar en `IN_PROGRESS` puede devolver 409.
- `tasks-board-web` — la columna «En curso» anuncia su capacidad.

## Decisiones con su porqué

**Solo `IN_PROGRESS`.** En un tablero de tres columnas, «trabajo en curso» es literalmente esa
columna: `TODO` es la cola de entrada y `DONE` el archivo. Un límite por columna arbitraria sería
vocabulario kanban sin su semántica.

**`FOR UPDATE`, y no un `SELECT count(*)`.** Es la condición de carrera clásica de
comprobar-y-actuar. **Se reprodujo:** al quitar el bloqueo, la prueba de concurrencia falla con
`expected [ 200, 200 ] to deeply equal [ 200, 409 ]` y el tablero queda con dos tareas en curso bajo
un límite de una.

**La regla vive en el servidor, no en el botón.** Deshabilitar el control cuando la columna está
llena es más barato y no es una regla: dos pestañas abiertas, o cualquier cliente de la API, se la
saltan. Una invariante de negocio que solo vive en React no es una invariante.

**La tarea que ya está dentro no cuenta dos veces.** Sin esa exclusión, corregir una errata con el
tablero lleno devolvería 409 y el límite pasaría de regla a trampa.

**`NULL` es «sin límite», y `0` se rechaza.** Un proyecto recién creado no debe nacer bloqueado.

## Exclusiones de alcance

- **Límites por columna configurables uno a uno.** Multiplicaría la interfaz de configuración sin
  añadir significado en un tablero de tres estados.
- **Expulsar tareas al bajar el límite.** Poner un límite por debajo del uso actual muestra el
  exceso y bloquea las entradas nuevas, que es lo que hace un equipo real cuando aprieta su límite.
- **Políticas de reposición, backlog y *pull*.** Exigen un estado nuevo y decisiones de producto que
  nadie ha tomado.

## Impact

Cambio aditivo de contrato: ningún campo se retira ni se renombra, y un proyecto sin `wipLimit` se
comporta exactamente como antes. La migración `0002` es reversible.

## Perfil de Readiness

`L2` (Operational). Toca esquema, contrato y una invariante de negocio impuesta por el motor.

## Viabilidad y esfuerzo

- **Esfuerzo:** M
- **Riesgo técnico:** medio — la concurrencia es la parte delicada, y está cubierta por una prueba
  que se verificó rompiendo el bloqueo a propósito.
- **Riesgo funcional:** bajo — sin límite declarado, el comportamiento es el de siempre.
