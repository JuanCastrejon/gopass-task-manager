## ADDED Requirements

### Requirement: El estado y la prioridad de una tarea son cerrados (RF-07, RF-08)

La barrera es doble: el esquema Zod de la API y el tipo `ENUM` de PostgreSQL.

#### Scenario: Estado fuera del dominio
- **GIVEN** una petición con `status: "BANANA"`
- **WHEN** llega a la API
- **THEN** responde `400 VALIDATION_ERROR` sin tocar la base

#### Scenario: Escritura directa contra la base
- **GIVEN** un `INSERT` con `status = 'BANANA'` ejecutado fuera de la API
- **WHEN** PostgreSQL lo evalúa
- **THEN** falla con `22P02`, porque el dominio lo impone el motor

#### Scenario: Valores por defecto
- **GIVEN** una tarea creada sin `status` ni `priority`
- **WHEN** se persiste
- **THEN** queda como `TODO` y `MEDIUM`

### Requirement: La fecha de completado la sella la base, no la aplicación (RF-09)

#### Scenario: Una tarea pasa a completada
- **GIVEN** una tarea en `IN_PROGRESS` con `completed_at` nulo
- **WHEN** su estado cambia a `DONE`
- **THEN** el trigger sella `completed_at` sin que ningún cliente lo envíe

#### Scenario: Una tarea sale de completada
- **GIVEN** una tarea en `DONE` con `completed_at` sellado
- **WHEN** su estado vuelve a `IN_PROGRESS`
- **THEN** `completed_at` vuelve a nulo

#### Scenario: Estado incoherente por cualquier vía de escritura
- **GIVEN** un `UPDATE` que deja `status = 'DONE'` con `completed_at` nulo
- **WHEN** PostgreSQL evalúa `tasks_done_completed_at`
- **THEN** el `CHECK` rechaza la escritura

### Requirement: Un proyecto con tareas no se puede borrar (RF-05)

#### Scenario: Borrado de un proyecto que tiene tareas
- **GIVEN** un proyecto con al menos una tarea
- **WHEN** se ejecuta el `DELETE`
- **THEN** `ON DELETE RESTRICT` lo impide y el motor devuelve `23503`
- **AND** el proyecto y sus tareas siguen intactos

### Requirement: Contrato de error uniforme RFC 7807

#### Scenario: Cualquier respuesta de error
- **GIVEN** una petición que provoca un error de cliente o de servidor
- **WHEN** el manejador la traduce
- **THEN** el cuerpo lleva `type`, `title`, `status`, `code`, `detail`, `instance` y `requestId`
- **AND** no contiene traza ni texto crudo de PostgreSQL

### Requirement: La aplicación abre con datos (RF-16)

#### Scenario: Primer arranque
- **GIVEN** una base recién creada
- **WHEN** el contenedor de la API arranca con `SEED_ON_START`
- **THEN** existen 4 proyectos y 11 tareas con contexto de negocio real

#### Scenario: Volver a sembrar
- **GIVEN** una base ya sembrada y modificada desde la interfaz
- **WHEN** el seed se ejecuta otra vez
- **THEN** no duplica ni revierte nada, porque inserta con `ON CONFLICT (id) DO NOTHING`
