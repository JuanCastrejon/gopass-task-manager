# Proposal: SL-17 — Fecha de vencimiento con semáforo calculado en el cliente

## Why

La gestión de tareas en proyectos exige visibilidad temporal para priorizar el trabajo urgente y
evitar retrasos. Sin fecha de vencimiento, el tablero solo reflejaba prioridad y estado, obligando
a los usuarios a deducir la urgencia a partir del título o la fecha de creación.

SL-17 incorpora la fecha de vencimiento a las tareas, con ordenación dedicada (`due_asc`), semáforo
visual preventivo e interactividad en el cliente que resuelve de raíz el desfase de 5 horas medido
entre servidores UTC y usuarios en Bogotá (GMT-05:00).

## What Changes

- **WP1 — Esquema de base de datos (`0008_tasks_due_date.sql`):**
  - Columna `tasks.due_date date NULL` (fecha civil pura, sin componente horario).
  - Valor `'due_asc'` añadido a `ENUM column_sort`.
  - Comentario explícito en catálogo documentando el porqué de `date` frente a `timestamptz`.
- **WP2 — Parser de tipos en conexión (`api/src/db/pool.ts`):**
  - Registro de `pg.types.setTypeParser(1082, (val) => val)` para evitar que `node-pg` convierta
    el OID 1082 en un objeto `Date` a medianoche UTC.
  - Advertencia documentada de su alcance global al proceso Node.js.
- **WP3 — Contrato y endpoints de API:**
  - Validación con Zod en `api/src/modules/tasks/tasks.schema.ts`: formato estricto `YYYY-MM-DD`,
    comprobación de existencia real en calendario y nullabilidad para limpiar la fecha.
  - Mapeo en `tasks.mapper.ts` y persistencia en `tasks.repository.ts`.
  - Integración de `due_asc` con `NULLS LAST` en la escalera de `CASE` de `LIST_QUERY`, preservando
    la precedencia de ADR-024.
  - Documentación Swagger / OpenAPI en `api/src/docs/swagger.ts`.
- **WP4 — Lógica pura de semáforo y presentación:**
  - Función pura `calcularEstadoVencimiento` en `web/src/features/tasks/due-date.ts`:
    - Vencida (< 0 días): rojo con texto explicativo.
    - Vence hoy (0 días): ámbar con texto explicativo.
    - Vence pronto (1 a 3 días naturales): ámbar preventivo.
    - Con tiempo (> 3 días): neutro.
    - Completada: atenuada, deja de alarmar inmediatamente.
  - Insignia `DueDateBadge` en `web/src/components/ui/Badge.tsx` con texto explícito y `aria-label`,
    cumpliendo la regla de no depender exclusivamente del color.
  - Formulario de edición con `<input type="date">` nativo y diagnóstico de completada a tiempo o
    tarde basado en fecha civil local en `TaskFormDialog.tsx`.
- **WP5 — Datos de demostración y suites de pruebas:**
  - Actualización de `api/src/db/seed.ts` con tareas que cubren los 3 estados del semáforo y sin fecha.
  - 48 pruebas en `tasks.test.ts` (5 dedicadas a SL-17: CRUD, validación en español, ordenación `due_asc`
    con nulos al final, blindaje de ADR-024 e ida y vuelta sin desfase).
  - 14 pruebas unitarias de semáforo en `due-date.test.ts`.
  - 1 prueba E2E en Playwright (`e2e/fecha-de-vencimiento.spec.ts`).
  - ADR-028 en `docs/spec/04-arquitectura.md`.

## Capabilities

### Modified Capabilities
- `tasks-api` — campo `dueDate` en esquemas y repositorios, y orden `due_asc`.
- `tasks-board-web` — insignia visual con semáforo, edición nativa y evaluación a tiempo/tarde.
- `board-columns` — criterio `due_asc` disponible en configuración de columnas.

## Decisiones con su porqué

**`due_date date` sin hora frente a `timestamptz`.**
Medición real en desarrollo: entre las 19:00 y las 23:59 locales de Bogotá, el servidor en UTC ya está
en el día siguiente. Con `timestamptz`, una fecha guardada como medianoche UTC se proyectaría a las 19:00
del día anterior en Bogotá, cambiando de día según el observador. Con `date`, la cadena `YYYY-MM-DD`
es idéntica universalmente.

**Parser de identidad para OID 1082.**
El driver `pg` instanciaba un `Date` a medianoche UTC que Express volvía a convertir en un instante
con zona en JSON. El parser de identidad asegura que la cadena viaje limpia de extremo a extremo.

**Semáforo calculado en el cliente (excepción a ADR-004 y ADR-009).**
«Vencida» no es un dato de la tarea sino una función del instante de consulta. PostgreSQL prohíbe
funciones no inmutables como `CURRENT_DATE` en columnas generadas, y ningún trigger se ejecuta a
medianoche. Al no poder computarse en el motor, vive como función pura en el cliente.

**Ventana de 3 días naturales (hoy incluido).**
Un viernes por la tarde es imprescindible advertir sobre las tareas que vencen el lunes siguiente.

**Una tarea completada deja de alarmar.**
Una tarea finalizada no requiere acción. El diagnóstico secundario («a tiempo» o «tarde») se calcula
en el diálogo comparando fechas civiles locales, evitando mezclar `date` con `timestamptz` en SQL.

## Exclusiones de alcance

- Almacenamiento de hora o minutos de vencimiento.
- Notificaciones externas por correo o push.

## Impact

Totalmente retrocompatible: columna anulable sin bloqueo de tabla. Bundle frontend: +0,91 kB gzip
(90,52 -> 91,43 kB) gracias al uso del elemento nativo `<input type="date">` (0 kB de dependencias).

## Perfil de Readiness

`L1` en interfaz y `L2` en datos.

## Viabilidad y esfuerzo

- **Esfuerzo:** M
- **Riesgo técnico:** bajo — resuelto y blindado por el parser de identidad y pruebas de integración.
- **Riesgo funcional:** bajo — integración en escalera de `CASE` respeta rigurosamente ADR-024.
