# 01 — Requisitos

## 1. Alcance derivado del enunciado

El enunciado pide literalmente cuatro capacidades: **crear proyectos**, **asociarles tareas**, que esas tareas tengan **estados** y **niveles de prioridad**, y **visualizar esa información de forma útil**. Todo lo demás es interpretación.

Se interpreta explícitamente que:

- "Crear proyectos" implica el ciclo de vida completo del proyecto (leer, editar, eliminar), porque una aplicación que solo crea y nunca corrige no es demostrable.
- "Visualizar de forma útil" es la frase con más grados de libertad del enunciado y por tanto la que más criterio revela. Se interpreta como: **la vista debe responder preguntas, no solo listar filas**. Preguntas concretas: ¿en qué proyecto hay más trabajo pendiente?, ¿qué está bloqueando el avance?, ¿qué es urgente?

## 2. Requisitos funcionales

| ID | Requisito | Nivel | Criterio de aceptación |
|---|---|---|---|
| RF-01 | Crear un proyecto con nombre y descripción opcional | MUST | `POST /api/projects` con nombre válido devuelve 201 y el recurso creado con `id`, `created_at`. Nombre vacío o solo espacios devuelve 400. |
| RF-02 | Listar proyectos con su resumen de avance | MUST | `GET /api/projects` devuelve cada proyecto con `task_count`, `done_count` y `progress` (0–100). Un proyecto sin tareas devuelve `progress: 0`, no error ni `null`. |
| RF-03 | Ver el detalle de un proyecto | MUST | `GET /api/projects/:id` devuelve el proyecto con su resumen. ID inexistente devuelve 404 `PROJECT_NOT_FOUND`; ID con formato inválido devuelve 400, no 500. |
| RF-04 | Editar un proyecto | MUST | `PATCH /api/projects/:id` acepta actualización parcial de `name` y `description`. Body vacío devuelve 400. |
| RF-05 | Eliminar un proyecto | MUST | `DELETE /api/projects/:id` devuelve 204 si el proyecto no tiene tareas; devuelve **409 `PROJECT_HAS_TASKS`** si las tiene. Ver ADR-003. |
| RF-06 | Crear una tarea asociada a un proyecto | MUST | `POST /api/projects/:projectId/tasks` devuelve 201. Un `projectId` inexistente devuelve 404, no 500 ni 201 huérfano. |
| RF-07 | La tarea tiene estado `TODO`, `IN_PROGRESS` o `DONE` | MUST | Un estado fuera del enum devuelve 400 tanto desde la API como desde la base de datos (doble barrera). Estado por defecto: `TODO`. |
| RF-08 | La tarea tiene prioridad `LOW`, `MEDIUM` o `HIGH` | MUST | Igual que RF-07. Prioridad por defecto: `MEDIUM`. |
| RF-09 | Cambiar el estado de una tarea | MUST | `PATCH /api/tasks/:id` con `status` persiste el cambio. Al pasar a `DONE` se sella `completed_at`; al salir de `DONE` se limpia. Invariante verificada por `CHECK` en PostgreSQL. |
| RF-10 | Editar y eliminar tareas | MUST | `PATCH` y `DELETE /api/tasks/:id`. Borrado de tarea es físico y sin restricción. |
| RF-11 | Listar las tareas de un proyecto agrupadas por estado | MUST | La vista de proyecto muestra tres columnas (`TODO`, `IN_PROGRESS`, `DONE`) con las tareas de cada estado y su prioridad visible. El agrupamiento persiste tras recargar: la verdad está en PostgreSQL, no en el estado de React. |
| RF-12 | Panel de visualización agregada | MUST | Una vista de entrada muestra: total de proyectos, total de tareas, tareas completadas, porcentaje global de avance y distribución de tareas por estado. Responde a "visualizar de forma útil". |
| RF-13 | Filtrar tareas por estado y prioridad, y buscar por título | SHOULD | Los filtros se aplican **en la consulta SQL**, no filtrando en el cliente un array ya descargado. |
| RF-14 | Fecha de vencimiento opcional con señal visual | WON'T (ver abajo) | Descartado. Si entra antes del feature freeze, entra completo: migración `0002`, campo en el contrato y badge en la UI. No se deja la columna a medias. |
| RF-15 | Health check | MUST | `GET /api/health` devuelve 200 con estado de la conexión a PostgreSQL. Es lo que consume el `healthcheck` de Docker Compose. |
| RF-16 | Datos de ejemplo cargados automáticamente | MUST | Tras `docker compose up`, la aplicación abre **con datos**, no en pantalla vacía. Seed idempotente. |

### WON'T — descartado explícitamente

No se implementa, y la razón se documenta:

| Descartado | Razón |
|---|---|
| Fecha de vencimiento (RF-14) | Ni la columna ni el badge. Se descartó la variante intermedia —columna en el esquema, UI para después— porque una columna que nadie escribe y que la API devuelve siempre como `null` comunica alcance abandonado, y porque añadirla más tarde es una operación de catálogo instantánea: no hay nada que "preparar". Entra completa o no entra. |
| Autenticación, usuarios, roles, permisos | No está en el enunciado. Introduce un modelo de identidad completo que desplazaría trabajo de calidad sobre lo que sí se pidió. |
| ~~Drag & drop entre columnas~~ | **Entró después.** Se descartó dos veces —por coste, y por el conflicto medido con el carrusel— hasta que quedó claro que un retardo de activación separa el arrastre del desplazamiento. Está encima de las flechas, nunca en su lugar: WCAG 2.5.7 exige la alternativa de un solo puntero. Ver ADR-021. |
| Soft delete / auditoría | No hay requisito de trazabilidad. Contamina toda consulta con `WHERE deleted_at IS NULL`. Se documenta cuándo sí se haría. |
| Paginación | Con volumen de demostración añade complejidad sin señal. Se documenta el umbral a partir del cual sería obligatoria. |
| Orden manual de tareas | Requiere índice flotante o lista enlazada y una API de reordenamiento. Fuera de alcance. |
| Asignados, comentarios, adjuntos | Cada uno es una entidad nueva. Son producto, no criterio de ingeniería. |
| Actualizaciones optimistas | La invalidación de la query tras la mutación es suficiente y no puede mostrar un estado que la base rechazó. Consistencia antes que teatralidad. |
| WebSockets, notificaciones, microservicios, Kubernetes | No resuelven ningún problema real de este dominio a este tamaño. |
| IA dentro del producto | La IA está en el proceso de ingeniería, no como funcionalidad. |

## 3. Requisitos no funcionales

| ID | Requisito | Cómo se verifica |
|---|---|---|
| RNF-01 | La aplicación completa arranca con **un solo comando** en una máquina limpia | `docker compose up --build` levanta PostgreSQL, ejecuta migraciones, siembra datos, y sirve API y frontend. Se prueba desde un `git clone` en carpeta nueva antes de enviar. |
| RNF-02 | La API es la frontera de confianza | Todo payload entrante pasa por un esquema Zod antes de tocar la capa de dominio. Ningún handler confía en el cliente. |
| RNF-03 | La integridad la garantiza PostgreSQL, no el código de aplicación | FK, `NOT NULL`, `CHECK`, `ENUM` e índice único están en las migraciones. Una validación en memoria es una condición de carrera. Ver ADR-004. |
| RNF-04 | Ningún error de base de datos llega crudo al cliente | Middleware central traduce códigos `SQLSTATE` a HTTP. Ninguna respuesta contiene stack trace ni texto de PostgreSQL. |
| RNF-05 | Errores con formato uniforme | Todas las respuestas de error siguen RFC 7807 (`application/problem+json`) con un `code` estable y legible por máquina. |
| RNF-06 | TypeScript estricto en ambos extremos | `strict: true`, sin `any` implícito. `npm run typecheck` en CI. |
| RNF-07 | La interfaz maneja los tres estados feos | Vacío, cargando y error tienen tratamiento explícito en cada vista. No hay pantallas en blanco ni spinners infinitos. |
| RNF-08 | Interfaz responsive y operable con teclado | Se verifica a 375 px y con navegación por `Tab` en los formularios. |
| RNF-09 | El puerto de PostgreSQL no colisiona con el del evaluador | Se publica en `5433:5432`. Un 5432 ocupado es la causa número uno de "no me arranca". |
| RNF-10 | Cobertura de líneas del backend ≥ 70 % sobre código funcional | `vitest --coverage`, excluyendo bootstrap y configuración. Adjudicado por el quality gate, no declarado a mano. |

## 4. Casos de uso principales

```
CU-01  Alta de proyecto
       Actor abre el panel → "Nuevo proyecto" → nombre + descripción → guarda
       → el proyecto aparece en la lista con 0 tareas y 0 % de avance.

CU-02  Alta de tarea en un proyecto
       Actor entra al proyecto → "Nueva tarea" → título, descripción,
       prioridad y estado → guarda → la tarea aparece en la columna de su
       estado y el porcentaje de avance del proyecto se recalcula.

CU-03  Avance del trabajo
       Actor cambia el estado de una tarea de TODO a IN_PROGRESS y luego a DONE
       → la tarea se mueve de columna, se sella completed_at, el porcentaje
       sube. Recargar la página conserva todo.

CU-04  Intento de borrado con dependencias
       Actor intenta eliminar un proyecto que tiene tareas
       → la API responde 409 PROJECT_HAS_TASKS
       → la interfaz explica la razón y ofrece ir al proyecto,
         no muestra "algo salió mal".

CU-05  Enfoque del trabajo
       Actor filtra por prioridad HIGH y estado distinto de DONE
       → ve únicamente lo urgente y pendiente, consultado en SQL.
```

## 5. Trazabilidad

Cada RF se cruza contra endpoint, componente y prueba en [05-estrategia-calidad.md](05-estrategia-calidad.md). Un requisito sin prueba asociada no se considera entregado.
