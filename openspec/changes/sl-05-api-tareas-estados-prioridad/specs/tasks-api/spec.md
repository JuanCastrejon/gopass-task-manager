## ADDED Requirements

### Requirement: Alta de tarea dentro de un proyecto (RF-06)

#### Scenario: Proyecto existente
- **GIVEN** un proyecto válido
- **WHEN** se pide `POST /api/projects/{projectId}/tasks` con título
- **THEN** responde `201`

#### Scenario: Proyecto inexistente
- **GIVEN** un `projectId` que no existe
- **WHEN** se crea la tarea
- **THEN** responde `404`, no `500` ni una tarea huérfana

### Requirement: Ciclo de vida del estado (RF-09)

#### Scenario: Paso a completada
- **GIVEN** una tarea en `TODO`
- **WHEN** se envía `PATCH` con `status: "DONE"`
- **THEN** persiste el cambio y `completedAt` queda sellado por la base

#### Scenario: Edición que no toca el estado
- **GIVEN** una tarea en `DONE`
- **WHEN** se edita solo el título
- **THEN** `completedAt` no se mueve

#### Scenario: El cliente intenta escribir la fecha de completado
- **GIVEN** un `PATCH` con `completedAt` en el cuerpo
- **WHEN** el esquema estricto lo evalúa
- **THEN** responde `400`
- **AND** no se descarta la clave en silencio haciendo creer que se guardó

### Requirement: Edición y borrado de tareas (RF-10)

#### Scenario: Borrado de tarea
- **GIVEN** una tarea existente
- **WHEN** se pide `DELETE /api/tasks/{id}`
- **THEN** responde `204` y el borrado es físico, sin restricción

### Requirement: Reasignación de una tarea a otro proyecto

#### Scenario: Proyecto destino válido
- **GIVEN** una tarea y otro proyecto existente
- **WHEN** se envía `PATCH` con el nuevo `projectId`
- **THEN** la tarea cambia de proyecto y el avance de ambos se recalcula

#### Scenario: Proyecto destino inexistente
- **GIVEN** un `projectId` destino que no existe
- **WHEN** se reasigna
- **THEN** responde `404`, distinguido del conflicto de borrado pese a compartir `SQLSTATE 23503`

### Requirement: Filtros y búsqueda resueltos en SQL (RF-13)

#### Scenario: Filtro por estado repetible
- **GIVEN** tareas en varios estados
- **WHEN** se pide `?status=TODO&status=IN_PROGRESS`
- **THEN** devuelve solo esas, filtradas en la consulta y no en el cliente

#### Scenario: Filtros combinados
- **GIVEN** el listado de un proyecto
- **WHEN** se combinan `priority` y `status`
- **THEN** ambos se aplican en la misma consulta

#### Scenario: Búsqueda insensible a mayúsculas
- **GIVEN** una tarea titulada `Homologar lectores TAG`
- **WHEN** se busca `?q=LECTORES`
- **THEN** aparece en el resultado

#### Scenario: Valor fuera del dominio
- **GIVEN** `?status=BANANA`
- **WHEN** llega a la API
- **THEN** responde `400`
- **AND** no se ignora en silencio, que devolvería resultados que el cliente cree filtrados

#### Scenario: Filtro vacío
- **GIVEN** `?status=`
- **WHEN** llega a la API
- **THEN** responde `400`: un filtro vacío es un error del cliente, no «todos»
