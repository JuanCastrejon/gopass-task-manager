## ADDED Requirements

### Requirement: Panel de entrada con la foto agregada (RF-12)

#### Scenario: Apertura de la aplicación
- **GIVEN** la aplicación con datos
- **WHEN** se abre la raíz
- **THEN** se ven total de proyectos, total de tareas, completadas, avance global y distribución por estado

### Requirement: Gestión de proyectos desde la interfaz (RF-01 a RF-04)

#### Scenario: Alta desde el diálogo
- **GIVEN** el panel abierto
- **WHEN** se crea un proyecto con nombre válido
- **THEN** aparece en el listado con «Sin tareas» y avance `0 %`

#### Scenario: Nombre rechazado por el servidor
- **GIVEN** un nombre que ya existe
- **WHEN** se intenta crear
- **THEN** el diálogo muestra el motivo y no se cierra

### Requirement: El conflicto de borrado se explica, no se oculta (RF-05)

#### Scenario: Aviso antes de intentarlo
- **GIVEN** un proyecto con tareas
- **WHEN** se abre el diálogo de borrado
- **THEN** advierte cuántas tareas tiene antes de que el usuario confirme

#### Scenario: El servidor responde 409
- **GIVEN** la confirmación de borrado de un proyecto con tareas
- **WHEN** la API responde `409 PROJECT_HAS_TASKS`
- **THEN** la interfaz muestra qué hacer para resolverlo
- **AND** no finge que el proyecto se borró

### Requirement: Los tres estados feos existen en cada vista

#### Scenario: Vista sin datos
- **GIVEN** un proyecto sin tareas
- **WHEN** se abre su tablero
- **THEN** cada columna muestra su estado vacío, no un hueco en blanco

#### Scenario: Fallo de red
- **GIVEN** la API inalcanzable
- **WHEN** se carga una vista
- **THEN** se muestra un error accionable, no una pantalla en blanco
