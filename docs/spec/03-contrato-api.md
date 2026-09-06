# 03 — Contrato de API

Base: `/api`. Contenido: `application/json`. Errores: `application/problem+json` (RFC 7807).

## 1. Endpoints

| Método | Ruta | Propósito | Éxito |
|---|---|---|---|
| GET | `/api/health` | Liveness + estado de PostgreSQL | 200 |
| GET | `/api/stats` | Agregados para el panel | 200 |
| GET | `/api/projects` | Listar proyectos con avance | 200 |
| POST | `/api/projects` | Crear proyecto | 201 |
| GET | `/api/projects/:id` | Detalle de proyecto con avance | 200 |
| PATCH | `/api/projects/:id` | Actualización parcial | 200 |
| DELETE | `/api/projects/:id` | Eliminar proyecto | 204 |
| GET | `/api/projects/:id/tasks` | Tareas del proyecto, con filtros | 200 |
| POST | `/api/projects/:id/tasks` | Crear tarea en el proyecto | 201 |
| GET | `/api/tasks/:id` | Detalle de tarea | 200 |
| PATCH | `/api/tasks/:id` | Actualización parcial (incluye cambio de estado) | 200 |
| PATCH | `/api/tasks/:id/reorder` | Reordenar tarea dentro o entre columnas | 200 |
| DELETE | `/api/tasks/:id` | Eliminar tarea | 204 |
| GET | `/api/projects/:id/labels` | Listar etiquetas de un proyecto (SL-18) | 200 |
| POST | `/api/projects/:id/labels` | Crear etiqueta en el proyecto | 201 |
| PATCH | `/api/labels/:id` | Actualización de etiqueta | 200 |
| DELETE | `/api/labels/:id` | Eliminar etiqueta (admite confirmación ?confirm=true) | 204 |
| PUT | `/api/tasks/:id/labels` | Reemplazar conjunto completo de etiquetas de una tarea | 200 |

Dieciocho endpoints bien justificados.

### Por qué `PATCH` para recursos y `PUT` para la colección de etiquetas de la tarea

Todas las actualizaciones individuales son parciales (`PATCH`): cambiar el estado de una tarea no debe obligar a reenviar título ni prioridad.

Sin embargo, para las etiquetas de una tarea se utiliza `PUT /api/tasks/:id/labels` enviando el conjunto completo `{ "labelIds": [...] }`:
1. **Idempotencia y sincronización:** La asignación de etiquetas desde el diálogo de edición es una selección de conjunto. Un `PUT` atómico reemplaza la colección completa en una sola transacción, eliminando condiciones de carrera y peticiones desordenadas que ocurrirían con múltiples POST/DELETE individuales.
2. **Garantía referencial:** En una sola operación el motor verifica que todas las etiquetas pertenezcan al mismo proyecto que la tarea a través de la clave foránea compuesta `(label_id, project_id)`.

### Por qué las tareas cuelgan del proyecto para crear y listar, pero no para editar

`POST /api/projects/:id/tasks` hace explícito en la URL que una tarea **no existe sin proyecto**: la relación es de composición, no de asociación opcional. Pero `PATCH /api/tasks/:id` es plano, porque el identificador de la tarea ya es globalmente único y anidar la ruta obligaría al cliente a arrastrar el `projectId` sin ganar nada. Es la convención que usan la mayoría de APIs REST maduras y se defiende en una frase.

## 2. Representaciones

### Project

```json
{
  "id": "8f14e45f-ceea-467a-9a1d-9e3f3f4a2b10",
  "name": "Telepeaje — integración de operadores",
  "description": "Conexión con los concesionarios viales",
  "taskCount": 8,
  "doneCount": 3,
  "byPriority": { "LOW": 2, "MEDIUM": 3, "HIGH": 3 },
  "progress": 38,
  "createdAt": "2026-09-04T14:02:11.482Z",
  "updatedAt": "2026-09-04T14:02:11.482Z"
}
```

`byPriority` viaja en el listado y en el detalle, porque ambos salen de la misma consulta. Las tres
claves están siempre presentes, también en 0: una clave ausente obligaría a cada consumidor a
saberse el dominio y a defenderse con `?? 0`. La tarjeta del panel la usa para señalar dónde hay
trabajo urgente, que es la pregunta que se hace desde un catálogo de proyectos; el desglose
completo se consulta ya dentro del tablero, donde la tarea sí tiene prioridad propia.

El límite de trabajo en curso **no vive aquí**: es de cada columna del tablero. Ver
`GET /api/projects/:projectId/columns`, cuyo recurso lleva `wipLimit`, `sort` y `taskCount`.
Superarlo devuelve **409 `WIP_LIMIT_REACHED`** con el límite concreto en el `detail`, y la regla se
impone dentro de una transacción que bloquea la fila de la columna destino: sin ese bloqueo, dos
peticiones simultáneas se la saltan entre las dos (ADR-022, ADR-023).

Una tarea lleva además `columnId`, y su `status` es siempre la categoría de esa columna. Las dos
cosas viajan juntas por obligación de una clave foránea compuesta, así que no pueden divergir.

En PostgreSQL los conteos son `COUNT(...) FILTER` colgados del `GROUP BY` que ya calculaba
`taskCount` y `doneCount`; el objeto lo compone el mapper. Se descartó replicar aquí el `jsonb_object_agg` de
`/stats`: medido sobre 204 proyectos y 20 011 tareas, las columnas no añaden un solo buffer al plan
y el agregado de `/stats` trasladado a por-proyecto lo multiplicaba por 4,3.

### Task

```json
{
  "id": "b2c7e0a4-3f51-4a0e-8b2d-1c9f77aa0e31",
  "projectId": "8f14e45f-ceea-467a-9a1d-9e3f3f4a2b10",
  "columnId": "e1f2a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b",
  "title": "Definir contrato de conciliación",
  "description": null,
  "status": "IN_PROGRESS",
  "priority": "HIGH",
  "position": 1024.0,
  "dueDate": "2026-03-12",
  "completedAt": null,
  "createdAt": "2026-09-04T14:05:00.000Z",
  "updatedAt": "2026-09-04T15:20:44.101Z",
  "labels": [
    {
      "id": "9a3b0001-0000-4000-8000-000000000001",
      "projectId": "8f14e45f-ceea-467a-9a1d-9e3f3f4a2b10",
      "name": "Backend",
      "color": "blue",
      "createdAt": "2026-09-04T14:02:11.482Z",
      "updatedAt": "2026-09-04T14:02:11.482Z"
    }
  ]
}
```

### Label (SL-18)

```json
{
  "id": "9a3b0001-0000-4000-8000-000000000001",
  "projectId": "8f14e45f-ceea-467a-9a1d-9e3f3f4a2b10",
  "name": "Backend",
  "color": "blue",
  "createdAt": "2026-09-04T14:02:11.482Z",
  "updatedAt": "2026-09-04T14:02:11.482Z"
}
```

El color pertenece a la paleta cerrada de 12 nombres semánticos: `slate`, `red`, `orange`, `amber`, `yellow`, `green`, `teal`, `cyan`, `blue`, `indigo`, `purple`, `pink`. En base de datos se almacena la clave semántica bajo restricción `CHECK`, nunca el valor hexadecimal libre.

`camelCase` en el borde HTTP, `snake_case` en PostgreSQL. La traducción vive en la capa de repositorio, en un único mapeador. Ninguna de las dos convenciones se filtra a la otra.

`dueDate` es una cadena en formato `YYYY-MM-DD` o `null`. Se almacena como columna `due_date date` en PostgreSQL (sin componente horario). Se descartó `timestamptz` debido al desfase horario de 5 horas entre el contenedor de base de datos/API (UTC) y los usuarios en Bogotá (America/Bogota, GMT-05:00): entre las 19:00 y las 23:59 locales una fecha con zona guardada a medianoche UTC se proyectaría en el día anterior. Con `date` y el type parser de `pg` configurado a string puro, la fecha viaja idéntica e inmutable para cualquier cliente.

#### Ciclo de vida de `dueDate` en las operaciones de tareas:

- **Crear (`POST /api/projects/:id/tasks`):**
  Acepta `dueDate?: string | null` (opcional). Si se proporciona, debe cumplir el formato estricto `YYYY-MM-DD` y corresponder a una fecha real en el calendario (ej. `2026-02-31` es rechazado con `400 VALIDATION_ERROR`). Si se omite, la tarea nace con `dueDate: null`.
- **Editar (`PATCH /api/tasks/:id`):**
  Acepta `dueDate?: string | null`. Pasar una cadena válida `YYYY-MM-DD` actualiza la fecha; enviar `dueDate: null` de forma explícita elimina la fecha de vencimiento persistida. Formatos inválidos o días no válidos devuelven `400 VALIDATION_ERROR`.
- **Listar (`GET /api/projects/:id/tasks`) y Detalle (`GET /api/tasks/:id`):**
  Toda tarea incluye siempre el campo `dueDate: string | null`. Al ordenar la columna con `sort = 'due_asc'`, los resultados se presentan en orden cronológico ascendente con las tareas sin fecha al final (`ASC NULLS LAST`), protegido en la escalera de `CASE pc.sort` para garantizar la convivencia con ADR-024.

El criterio de ordenación `due_asc` dentro de `project_columns.sort` ordena las tareas de la columna por fecha de vencimiento ascendente, situando las tareas sin fecha al final (`ASC NULLS LAST`), protegido dentro de la escalera de `CASE pc.sort` para preservar las garantías de ADR-024.

`position` es un número fraccionario (`double precision`) que determina el orden manual dentro de la columna cuando esta tiene configurado `sort = 'manual'`. El cliente no calcula posiciones: para reordenar invoca `PATCH /api/tasks/:id/reorder` enviando `{ columnId, previousTaskId, nextTaskId }` y el servidor deriva el punto medio o el desplazamiento adecuado:
- Si `previousTaskId` es null y `nextTaskId` está presente: se ubica al inicio de la columna (`next / 2`).
- Si `previousTaskId` está presente y `nextTaskId` es null: se ubica a continuación de `previousTaskId` (`prev + 1024`).
- Si ambas vecinas están presentes: se calcula el punto medio entre ambas (`(prev + next) / 2`).
- Si ambas vecinas son null: significa explícitamente «al final de la columna» (`MAX(position) + 1024` en esa columna, o `1024` si está vacía).
Si el hueco se agota por límite de precisión de coma flotante, la restricción única `tasks_position_unica` produce `23505` (o `22003`), y el servidor rebalancea automáticamente la columna con `ROW_NUMBER() * 1024` de forma atómica y transparente.

### `GET /api/stats`

```json
{
  "projects": 4,
  "tasks": 27,
  "done": 11,
  "progress": 41,
  "byStatus":   { "TODO": 9, "IN_PROGRESS": 7, "DONE": 11 },
  "byPriority": { "LOW": 6, "MEDIUM": 13, "HIGH": 8 }
}
```

Un solo endpoint agregado en lugar de que el frontend descargue todo y cuente en JavaScript. Es la diferencia entre "visualizar información" y "renderizar un array".

## 3. Filtros

`GET /api/projects/:id/tasks` acepta:

| Parámetro | Valores | Comportamiento |
|---|---|---|
| `status` | `TODO` \| `IN_PROGRESS` \| `DONE` | Repetible. `?status=TODO&status=IN_PROGRESS` |
| `priority` | `LOW` \| `MEDIUM` \| `HIGH` | Repetible |
| `q` | texto libre | `ILIKE` sobre `title`, con el patrón parametrizado |
| `labels` | UUID | Repetible. `?labels=<uuid>&labels=<uuid>`. Filtra tareas con alguna de las etiquetas indicadas |

Los filtros se traducen a la condición del `LEFT JOIN` en la consulta. Un valor fuera del enum o un UUID mal formado devuelve 400 con el detalle del campo, no lo ignora en silencio: ignorar un filtro inválido devuelve resultados que el cliente cree filtrados.

**El filtro de etiquetas se ubica en el `LEFT JOIN`, nunca en el `WHERE`:**
Se implementa mediante:
```sql
AND ($5::uuid[] IS NULL OR EXISTS (
  SELECT 1 FROM task_labels tl WHERE tl.task_id = t.id AND tl.label_id = ANY($5)
))
```
Si se ubicara en el `WHERE`, un filtro de etiquetas que no coincida con ninguna tarea descartaría también la fila del proyecto, haciendo que un proyecto válido responda un falso `404 PROJECT_NOT_FOUND` en lugar de una lista vacía `[]` con `200 OK` (ADR-016).

Contrato de casos borde del filtro, definido explícitamente para que no lo decida el azar:

| Entrada | Comportamiento |
|---|---|
| Parámetro ausente | No se aplica ese filtro |
| `?status=` (vacío) | 400 `VALIDATION_ERROR`. Un filtro vacío es un error del cliente, no "todos" |
| `?status=TODO&status=TODO` | Se deduplica antes de la consulta |
| `?status=BANANA` | 400 `VALIDATION_ERROR`, rechazado por Zod **antes** de llegar a PostgreSQL |
| `?labels=no-uuid` | 400 `VALIDATION_ERROR`, formato UUID inválido |
| Orden de los resultados | Escalera de `CASE pc.sort`, con desempate estable final `created_at DESC, id` |

La forma de la consulta está verificada contra PostgreSQL 16 con el driver `pg`:

```sql
SELECT ... FROM tasks WHERE project_id = $1 AND status = ANY($2)
```

Pasando un `string[]` de JavaScript como `$2`, PostgreSQL infiere `task_status[]` del contexto y **no hace falta cast explícito**. Si el valor no pertenece al enum, el motor devuelve `22P02`; aun así el filtro se valida antes con Zod, para que el error salga con el detalle del campo y no como un error de base de datos traducido.

## 4. Errores

Formato único, RFC 7807:

```json
{
  "type": "https://gopass-task-manager.local/errors/project-has-tasks",
  "title": "El proyecto tiene tareas asociadas",
  "status": 409,
  "code": "PROJECT_HAS_TASKS",
  "detail": "No se puede eliminar un proyecto que todavía tiene tareas. Elimínalas primero.",
  "instance": "/api/projects/8f14e45f-ceea-467a-9a1d-9e3f3f4a2b10",
  "requestId": "3f22b195-0470-4c1c-9108-f848fcbdb7f7"
}
```

Errores de validación añaden desglose por campo:

```json
{
  "type": "https://gopass-task-manager.local/errors/validation",
  "title": "Payload inválido",
  "status": 400,
  "code": "VALIDATION_ERROR",
  "instance": "/api/projects",
  "requestId": "950a3ea4-f694-4bb7-86a2-af0607eaf62b",
  "errors": [
    { "path": "name",   "message": "El nombre no puede estar vacío" },
    { "path": "status", "message": "Valor inválido. Esperado: TODO | IN_PROGRESS | DONE" }
  ]
}
```

`code` es el contrato estable para el cliente. `title` y `detail` son para humanos y pueden cambiar sin romper nada. El frontend nunca compara contra `title`.

### Catálogo de códigos

| `code` | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod rechaza el body, la query o el parámetro de ruta |
| `PROJECT_NOT_FOUND` | 404 | El proyecto no existe |
| `TASK_NOT_FOUND` | 404 | La tarea no existe |
| `LABEL_NOT_FOUND` | 404 | La etiqueta no existe |
| `PROJECT_NAME_TAKEN` | 409 | Ya existe un proyecto con ese nombre (ignorando mayúsculas y espacios) |
| `LABEL_NAME_TAKEN` | 409 | Ya existe una etiqueta con ese nombre en el proyecto (ignorando mayúsculas y espacios) |
| `PROJECT_HAS_TASKS` | 409 | Se intenta eliminar un proyecto con tareas |
| `LABEL_HAS_TASKS` | 409 | Se intenta eliminar una etiqueta asignada a tareas sin confirmación (`?confirm=true`) |
| `WIP_LIMIT_REACHED` | 409 | La columna destino ha alcanzado su límite de trabajo en curso |
| `ROUTE_NOT_FOUND` | 404 | La ruta no existe. Se devuelve en el mismo formato que el resto, no como el HTML por defecto de Express |
| `INTERNAL_ERROR` | 500 | Cualquier cosa no prevista. Sin `detail`, sin stack trace; con `requestId` para correlacionar con el log |

Toda respuesta —correcta o no— lleva la cabecera `X-Request-Id`, y todo error lo repite en el cuerpo. Se genera siempre en el servidor: no se acepta un `X-Request-Id` entrante (ADR-010).

## 5. Mapeo de `SQLSTATE` a HTTP

Esta tabla es el corazón del middleware de errores. Existe porque **la integridad la impone PostgreSQL** (RNF-03), y por tanto los conflictos reales llegan como errores del driver, no como resultados de un `SELECT` previo.

| `SQLSTATE` | Nombre | Situación | Respuesta |
|---|---|---|---|
| `23503` | `foreign_key_violation` | `DELETE` de proyecto con tareas (`tasks_project_id_fkey`) | 409 `PROJECT_HAS_TASKS` |
| `23503` | `foreign_key_violation` | `INSERT` de tarea con `project_id` inexistente | 404 `PROJECT_NOT_FOUND` |
| `23503` | `foreign_key_violation` | Asignación de etiqueta de otro proyecto (`task_labels_label_fkey`) | 400 `VALIDATION_ERROR` |
| `23505` | `unique_violation` | Nombre de proyecto repetido (`projects_name_unique_ci`) | 409 `PROJECT_NAME_TAKEN` |
| `23505` | `unique_violation` | Nombre de etiqueta repetido (`labels_project_name_unique_ci`) | 409 `LABEL_NAME_TAKEN` |
| `23505` | `unique_violation` | Posición manual duplicada (`tasks_position_unica`) | rebalanceo automático transparente |
| `23514` | `check_violation` | Nombre en blanco, color fuera de paleta, invariante de `completed_at` | 400 `VALIDATION_ERROR` |
| `22P02` | `invalid_text_representation` | UUID mal formado o valor fuera del `ENUM` | 400 `VALIDATION_ERROR` |
| `23502` | `not_null_violation` | Campo obligatorio ausente | 400 `VALIDATION_ERROR` |
| resto | — | — | 500 `INTERNAL_ERROR`, registrado con `requestId` |

El mismo `23503` se traduce a **409 o 404 según la operación**, y eso es deliberado: al borrar, el conflicto es del recurso que se quiere borrar; al insertar, el recurso ausente es el padre referenciado. Confundirlos es un error frecuente y distinguirlos es una respuesta de entrevista de un renglón.

### Por qué no se consulta antes de escribir

La alternativa ingenua es:

```ts
const count = await countTasks(projectId);
if (count > 0) return conflict();
await deleteProject(projectId);
```

Entre el `SELECT` y el `DELETE` cabe un `INSERT` de otra petición. La verificación en memoria es una condición de carrera. Se intenta el `DELETE` y se traduce el error que devuelve el motor: la garantía es atómica porque la impone la transacción, no el proceso de Node.

## 6. Documentación de la API

`openapi.yaml` corto y escrito a mano (no generado por reflexión), servido en `/api/docs` con Swagger UI. Se genera al final, tras el feature freeze, y se valida contra los tests de integración: **cualquier endpoint documentado que no tenga una prueba que lo ejerza se borra de la documentación**. Documentación que miente es peor que no tenerla.

Alternativa aceptada si el tiempo aprieta: colección `.http` en el repositorio, ejecutable desde VS Code REST Client, que sirve además como guion de demostración.
