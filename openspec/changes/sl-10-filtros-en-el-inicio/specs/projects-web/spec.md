## ADDED Requirements

### Requirement: El resumen del proyecto incluye su desglose por prioridad

#### Scenario: Proyecto con tareas de varias prioridades
- **GIVEN** un proyecto con dos tareas de prioridad alta y una baja
- **WHEN** se pide `GET /api/projects`
- **THEN** su resumen trae `byPriority: { LOW: 1, MEDIUM: 0, HIGH: 2 }`
- **AND** `MEDIUM` aparece en 0 en vez de faltar, para que ningún consumidor tenga que defenderse de una clave ausente

#### Scenario: Proyecto sin ninguna tarea
- **GIVEN** un proyecto recién creado
- **WHEN** se pide su resumen
- **THEN** las tres prioridades valen 0 y son números, no `null` ni cadenas

#### Scenario: Listado y detalle coinciden
- **GIVEN** un proyecto con tareas
- **WHEN** se piden `GET /api/projects` y `GET /api/projects/:id`
- **THEN** el desglose es idéntico en ambas rutas, porque comparten la misma consulta

### Requirement: Filtrar los proyectos del panel

#### Scenario: Buscar por nombre
- **GIVEN** el panel con varios proyectos
- **WHEN** se escribe parte de un nombre en el buscador
- **THEN** solo quedan los proyectos cuyo nombre lo contiene, sin distinguir mayúsculas
- **AND** la lista responde al teclear, sin esperar a que la URL se ponga al día

#### Scenario: Filtrar por prioridad de las tareas que contiene
- **GIVEN** un proyecto con una tarea de prioridad alta y otro sin ninguna
- **WHEN** se pulsa el chip «Alta»
- **THEN** queda solo el primero
- **AND** un proyecto sin tareas nunca coincide con ningún chip de prioridad

#### Scenario: La tarjeta explica por qué el chip la deja o la quita
- **GIVEN** un proyecto con tareas
- **WHEN** se mira su tarjeta
- **THEN** muestra una píldora por cada prioridad con tareas, con su número
- **AND** no pinta un cero para las prioridades sin tareas

#### Scenario: Los filtros sobreviven a una recarga y se pueden compartir
- **GIVEN** una búsqueda y un chip activos
- **WHEN** se recarga la página, o se abre la URL en otra pestaña
- **THEN** el campo y el chip vuelven en el mismo estado y la lista sale ya filtrada

#### Scenario: Un chip pulsado mientras se escribe no se desmarca solo
- **GIVEN** una búsqueda a medio teclear, con la escritura en la URL aún pendiente
- **WHEN** se pulsa un chip de prioridad antes de que venza el retardo
- **THEN** la URL acaba con los dos parámetros
- **AND** el chip sigue pulsado pasado el retardo

### Requirement: El vacío del panel distingue «no hay» de «no coincide»

#### Scenario: Todavía no hay proyectos
- **GIVEN** una base sin proyectos
- **WHEN** se abre el panel
- **THEN** se ofrece crear el primero
- **AND** no se muestra la barra de filtros, que no podría hacer nada

#### Scenario: Hay proyectos pero ninguno coincide
- **GIVEN** proyectos en la base y un filtro que no casa con ninguno
- **WHEN** se mira el panel
- **THEN** dice que ninguno coincide y ofrece limpiar los filtros
- **AND** **no** invita a «crear el primer proyecto», que sería falso
