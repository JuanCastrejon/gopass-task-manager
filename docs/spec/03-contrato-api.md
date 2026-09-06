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
| DELETE | `/api/tasks/:id` | Eliminar tarea | 204 |

Doce endpoints. No cuarenta.

### Por qué `PATCH` y no `PUT`

Todas las actualizaciones de esta aplicación son parciales: cambiar el estado de una tarea no debe obligar al cliente a reenviar título, descripción y prioridad. `PUT` con semántica de reemplazo total invitaría a que el cliente borre campos por omisión. `PATCH` con un esquema Zod de campos opcionales y validación de "al menos un campo presente" es lo honesto.

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

En PostgreSQL son tres `COUNT(...) FILTER` colgados del `GROUP BY` que ya calculaba `taskCount` y
`doneCount`; el objeto lo compone el mapper. Se descartó replicar aquí el `jsonb_object_agg` de
`/stats`: medido sobre 204 proyectos y 20 011 tareas, las columnas no añaden un solo buffer al plan
y el agregado de `/stats` trasladado a por-proyecto lo multiplicaba por 4,3.

### Task

```json
{
  "id": "b2c7e0a4-3f51-4a0e-8b2d-1c9f77aa0e31",
  "projectId": "8f14e45f-ceea-467a-9a1d-9e3f3f4a2b10",
  "title": "Definir contrato de conciliación",
  "description": null,
  "status": "IN_PROGRESS",
  "priority": "HIGH",
  "completedAt": null,
  "createdAt": "2026-09-04T14:05:00.000Z",
  "updatedAt": "2026-09-04T15:20:44.101Z"
}
```

`camelCase` en el borde HTTP, `snake_case` en PostgreSQL. La traducción vive en la capa de repositorio, en un único mapeador. Ninguna de las dos convenciones se filtra a la otra.

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

Los filtros se traducen a `WHERE` en la consulta. Un valor fuera del enum devuelve 400 con el detalle del campo, no lo ignora en silencio: ignorar un filtro inválido devuelve resultados que el cliente cree filtrados.

Contrato de casos borde del filtro, definido explícitamente para que no lo decida el azar:

| Entrada | Comportamiento |
|---|---|
| Parámetro ausente | No se aplica ese filtro |
| `?status=` (vacío) | 400 `VALIDATION_ERROR`. Un filtro vacío es un error del cliente, no "todos" |
| `?status=TODO&status=TODO` | Se deduplica antes de la consulta |
| `?status=BANANA` | 400 `VALIDATION_ERROR`, rechazado por Zod **antes** de llegar a PostgreSQL |
| Orden de los resultados | Siempre `ORDER BY priority DESC, created_at DESC, id` — el `id` final garantiza orden estable entre ejecuciones |

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
| `PROJECT_NAME_TAKEN` | 409 | Ya existe un proyecto con ese nombre (ignorando mayúsculas y espacios) |
| `PROJECT_HAS_TASKS` | 409 | Se intenta eliminar un proyecto con tareas |
| `ROUTE_NOT_FOUND` | 404 | La ruta no existe. Se devuelve en el mismo formato que el resto, no como el HTML por defecto de Express |
| `INTERNAL_ERROR` | 500 | Cualquier cosa no prevista. Sin `detail`, sin stack trace; con `requestId` para correlacionar con el log |

Toda respuesta —correcta o no— lleva la cabecera `X-Request-Id`, y todo error lo repite en el cuerpo. Se genera siempre en el servidor: no se acepta un `X-Request-Id` entrante (ADR-010).

## 5. Mapeo de `SQLSTATE` a HTTP

Esta tabla es el corazón del middleware de errores. Existe porque **la integridad la impone PostgreSQL** (RNF-03), y por tanto los conflictos reales llegan como errores del driver, no como resultados de un `SELECT` previo.

| `SQLSTATE` | Nombre | Situación | Respuesta |
|---|---|---|---|
| `23503` | `foreign_key_violation` | `DELETE` de proyecto con tareas | 409 `PROJECT_HAS_TASKS` |
| `23503` | `foreign_key_violation` | `INSERT` de tarea con `project_id` inexistente | 404 `PROJECT_NOT_FOUND` |
| `23505` | `unique_violation` | Nombre de proyecto repetido | 409 `PROJECT_NAME_TAKEN` |
| `23514` | `check_violation` | Nombre en blanco, título en blanco, invariante de `completed_at` | 400 `VALIDATION_ERROR` |
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
