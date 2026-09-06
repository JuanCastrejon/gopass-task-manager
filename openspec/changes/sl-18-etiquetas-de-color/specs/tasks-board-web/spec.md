## ADDED Requirements

### Requirement: Gestión de etiquetas de proyecto

#### Scenario: Creación de etiqueta válida
- **GIVEN** un proyecto existente
- **WHEN** se envía `POST /api/projects/:id/labels` con un nombre no vacío y un color de la paleta permitida
- **THEN** la etiqueta se persiste asociada al proyecto
- **AND** responde `201 Created` con el recurso creado

#### Scenario: Rechazo de nombre duplicado insensible a mayúsculas
- **GIVEN** una etiqueta con nombre "Urgente" en un proyecto
- **WHEN** se intenta crear otra etiqueta con nombre " urgente " en el mismo proyecto
- **THEN** la API rechaza la solicitud con `409 LABEL_NAME_TAKEN`
- **AND** la base no almacena duplicados

#### Scenario: Rechazo de color no contemplado en la paleta
- **WHEN** se envía un color arbitrario o hexadecimal no perteneciente a los 12 permitidos
- **THEN** la API responde `400 VALIDATION_ERROR`

#### Scenario: Eliminación protegida de etiqueta con tareas asociadas
- **GIVEN** una etiqueta asignada a una o más tareas
- **WHEN** se envía `DELETE /api/labels/:id` sin confirmación
- **THEN** la API responde `409 LABEL_HAS_TASKS` informando el número de tareas asociadas
- **WHEN** se envía `DELETE /api/labels/:id?confirm=true`
- **THEN** la etiqueta y sus asignaciones en `task_labels` se eliminan atómicamente y responde `204 No Content`

### Requirement: Asignación y desasignación de etiquetas en tareas

#### Scenario: Reemplazo atómico de etiquetas de una tarea
- **GIVEN** una tarea en un proyecto y un conjunto de etiquetas válidas de ese proyecto
- **WHEN** se envía `PUT /api/tasks/:id/labels` con la lista completa de identificadores `{ "labelIds": [...] }`
- **THEN** las asignaciones previas se reemplazan por la nueva lista en una única transacción
- **AND** responde `200 OK` con la lista actualizada de etiquetas

#### Scenario: Rechazo de asignación cruzada entre proyectos distintos
- **GIVEN** una tarea del proyecto A y una etiqueta del proyecto B
- **WHEN** se intenta asignar la etiqueta a la tarea
- **THEN** la base de datos rechaza la inserción mediante la clave foránea compuesta `(label_id, project_id)`
- **AND** la API responde `400 VALIDATION_ERROR` impidiendo la corrupción relacional

### Requirement: Visualización y filtrado en el tablero

#### Scenario: Renderizado accesible de píldoras de etiqueta
- **GIVEN** una tarea con etiquetas asignadas
- **THEN** la tarjeta en el tablero muestra una píldora por etiqueta con su nombre legible y su token de color
- **AND** no se utiliza el color como único canal de información

#### Scenario: Filtrado por etiquetas en la URL
- **GIVEN** un tablero con tareas etiquetadas
- **WHEN** el usuario selecciona una o más etiquetas en el filtro
- **THEN** la URL se actualiza con `?labels=<id>&labels=<id>`
- **AND** solo se muestran las tareas que contienen al menos una de las etiquetas seleccionadas
- **AND** un proyecto sin tareas coincidentes devuelve una lista vacía con `200 OK` sin provocar un 404 falso

### Requirement: Cascada al eliminar proyecto

#### Scenario: Borrado de proyecto con etiquetas y sin tareas
- **GIVEN** un proyecto con etiquetas creadas pero sin tareas asociadas
- **WHEN** se solicita `DELETE /api/projects/:id`
- **THEN** el proyecto y todas sus etiquetas se eliminan en cascada respondiendo `204 No Content`
- **AND** no se produce un error 500
