## ADDED Requirements

### Requirement: Alta de proyecto (RF-01)

#### Scenario: Nombre válido
- **GIVEN** un cuerpo con `name` no vacío
- **WHEN** se pide `POST /api/projects`
- **THEN** responde `201` con `id` y `createdAt`

#### Scenario: Nombre en blanco
- **GIVEN** un cuerpo con `name: "   "`
- **WHEN** se pide `POST /api/projects`
- **THEN** responde `400` señalando el campo

#### Scenario: Nombre duplicado ignorando mayúsculas y espacios
- **GIVEN** un proyecto llamado `Peajes — corredor sur`
- **WHEN** se crea otro con `"  peajes — corredor sur  "`
- **THEN** responde `409 PROJECT_NAME_TAKEN`
- **AND** el conflicto lo detecta el índice `lower(btrim(name))`, no un `SELECT` previo

### Requirement: Listado con avance calculado en la base (RF-02)

#### Scenario: Proyectos con tareas
- **GIVEN** proyectos con tareas en distintos estados
- **WHEN** se pide `GET /api/projects`
- **THEN** cada uno trae `taskCount`, `doneCount` y `progress` de 0 a 100
- **AND** salen de una sola consulta con agregación condicional, no de N+1

#### Scenario: Proyecto sin tareas
- **GIVEN** un proyecto sin ninguna tarea
- **WHEN** se lista
- **THEN** `progress` es `0`, ni `null` ni error

### Requirement: Detalle, edición y borrado de proyecto (RF-03, RF-04, RF-05)

#### Scenario: Identificador con formato inválido
- **GIVEN** un `id` que no es UUID
- **WHEN** se pide el detalle
- **THEN** responde `400`, no `500`

#### Scenario: Identificador válido que no existe
- **GIVEN** un UUID sin proyecto asociado
- **WHEN** se pide el detalle
- **THEN** responde `404 PROJECT_NOT_FOUND`

#### Scenario: Actualización parcial
- **GIVEN** un proyecto existente
- **WHEN** se envía `PATCH` con solo `description`
- **THEN** `name` no se toca
- **AND** un `null` explícito en `description` borra el campo

#### Scenario: Cuerpo de PATCH vacío
- **GIVEN** un `PATCH` con `{}`
- **WHEN** llega a la API
- **THEN** responde `400`, porque no declara ninguna intención

#### Scenario: Borrado de proyecto vacío
- **GIVEN** un proyecto sin tareas
- **WHEN** se pide `DELETE`
- **THEN** responde `204`

#### Scenario: Borrado de proyecto con tareas
- **GIVEN** un proyecto con tareas
- **WHEN** se pide `DELETE`
- **THEN** responde `409 PROJECT_HAS_TASKS` con el motivo explicado
- **AND** nada se ha destruido

### Requirement: Métricas agregadas del panel (RF-12)

#### Scenario: Distribución completa por estado y prioridad
- **GIVEN** un conjunto de tareas que no cubre todos los estados
- **WHEN** se pide `GET /api/stats`
- **THEN** las claves de `byStatus` y `byPriority` vienen completas, con `0` incluido
- **AND** el consumidor no necesita conocerse el dominio para leerlas

### Requirement: Documentación viva de la API

#### Scenario: Exploración interactiva
- **GIVEN** la API corriendo
- **WHEN** se abre `/api/docs`
- **THEN** se sirve Swagger UI
- **AND** `/api/docs.json` devuelve el documento OpenAPI 3.0

#### Scenario: El documento no miente sobre los errores
- **GIVEN** una operación con parámetro de ruta
- **WHEN** se compara el documento con el runtime
- **THEN** toda respuesta que el runtime puede emitir está declarada, incluido el `400`
