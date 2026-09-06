# Proposal: SL-13 — Columnas configurables por proyecto

## Why

El tablero tenía tres columnas porque las columnas **eran** el `ENUM task_status`: fijas, globales y
las mismas para todos los proyectos. Un equipo que trabaja con una etapa de revisión, otro que
distingue «Bloqueada» de «En curso» y otro que separa «Entregado» de «Cerrado» no caben en ese
molde, y el tablero deja de reflejar su proceso real.

La dificultad no es añadir una tabla. De ese enum cuelgan **cuatro garantías** que el producto no
puede perder: el `CHECK` que impone que `completed_at` exista si y solo si la tarea está terminada,
el trigger que lo sella, el `enum_range` con el que `/stats` asegura que un estado sin tareas
aparezca con 0, y el límite de trabajo en curso. Permitir columnas arbitrarias obliga a decidir qué
pasa con las cuatro.

## What Changes

- **WP1 — `project_columns` (`0003`):** tabla con `name`, `category`, `position`, `wip_limit`, más
  el trigger que crea las tres columnas iniciales de todo proyecto y la copia de las de los
  proyectos existentes.
- **WP2 — `tasks.column_id` (`0004`):** relleno de las tareas existentes, clave foránea compuesta
  `(column_id, status) → (id, category)`, y el trigger que deriva la columna de una tarea insertada
  sin ella.
- **WP3 — Módulo `columns`:** listar, crear, renombrar, reordenar y borrar, con los cuatro errores
  de dominio nuevos.
- **WP4 — El límite baja a la columna:** `projects.wip_limit` desaparece; la comprobación bloquea
  la fila de la columna destino en lugar de la del proyecto.
- **WP5 — Tablero de N columnas:** rejilla que no colapsa, flechas contiguas por posición, gestión
  de columnas y desplegable de columna en el diálogo de tarea.
- **WP6 — Verificación:** 25 pruebas de integración y 3 escenarios E2E.

## Capabilities

### New Capabilities
- `board-columns` — configurar las columnas del tablero de un proyecto.

### Modified Capabilities
- `tasks-api` — la tarea vive en una columna; el contrato admite `columnId` además de `status`.
- `tasks-board-web` — el tablero deja de conocer su forma y la recibe.
- `projects-api` — el límite de trabajo en curso se retira del proyecto.

## Decisiones con su porqué

**El `ENUM` se conserva como categoría de la columna.** Es la decisión central. Se descartó
eliminarlo y sustituirlo por un `is_terminal boolean`, que era la propuesta de una de las dos
revisiones técnicas. Dos evidencias lo desempataron:

| | Archivos a tocar | Reversible |
|---|---|---|
| Eliminar el enum | **16** | la migración de retirada, **no** |
| Conservarlo como categoría | **9** | sí, comprobado |

Y el argumento en contra —que clasificar «En revisión» o «Bloqueada» en tres categorías es
artificial— resultó falso al verificarlo: **es el modelo de Jira**, donde cada estado personalizado
declara una de exactamente tres categorías y Atlassian se niega por diseño a permitir más.

**Clave foránea compuesta, no dos campos sueltos.** `(column_id, status)` referencia
`(id, category)`, así que el motor impide que la columna y el estado diverjan. Verificado contra
PostgreSQL: rechaza mover a una columna terminal sin cambiar el estado, rechaza cambiar el estado
sin mover de columna, y solo acepta las dos cosas a la vez.

**Dos triggers y no dos funciones de servicio.** Misma razón que el trigger de `completed_at`: una
regla que solo viva en la aplicación deja fuera al seed, a `psql` y a cualquier otro cliente.

**La categoría es inmutable tras crear la columna.** Cambiarla movería el estado de todas sus tareas
por efecto colateral, sellando o borrando fechas de completado que nadie pidió tocar.

**El límite baja del proyecto a la columna.** «Desarrollo» máximo 3 y «QA» máximo 2 es una política
real que un único límite por proyecto no puede expresar. Conservar además `projects.wip_limit`
dejaría dos sitios para declarar lo mismo, uno de ellos solo efectivo al crear.

## Exclusiones de alcance

- **Orden manual de tareas dentro de la columna.** Sigue fuera: el orden lo fija el servidor. Ver
  `sl-11`, donde se corrigió la afordancia que lo prometía.
- **Columnas compartidas entre proyectos, o plantillas de tablero.** Ningún requisito las pide.
- **Más de tres categorías.** Es la restricción que hace posible el informe entre proyectos, y la
  misma que impone Jira.

## Impact

Cambio de esquema con dos migraciones reversibles, verificadas también desde una base vacía. Las 85
pruebas que ya existían siguieron pasando sin reescribirse, salvo las del límite, que ahora apuntan
a la columna.

## Perfil de Readiness

`L2` (Operational). Cambia esquema, contrato e invariantes impuestas por el motor.

## Viabilidad y esfuerzo

- **Esfuerzo:** L
- **Riesgo técnico:** medio — la parte delicada es que columna y estado no diverjan, y está cerrada
  por el motor y cubierta por pruebas.
- **Riesgo funcional:** bajo — un proyecto que no toque sus columnas se comporta igual que antes.
