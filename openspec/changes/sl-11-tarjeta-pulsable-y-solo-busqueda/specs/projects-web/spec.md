## MODIFIED Requirements

### Requirement: Filtrar los proyectos del panel

Fuera del proyecto **solo se busca por nombre**. Los chips de prioridad descritos en SL-10 se
retiran: un proyecto no tiene prioridad propia.

#### Scenario: Buscar por nombre
- **GIVEN** el panel con varios proyectos
- **WHEN** se escribe parte de un nombre en el buscador
- **THEN** solo quedan los proyectos cuyo nombre lo contiene, sin distinguir mayúsculas
- **AND** la lista responde al teclear, sin esperar a que la URL se ponga al día

#### Scenario: El panel no ofrece filtros de prioridad
- **GIVEN** el panel de proyectos
- **WHEN** se buscan controles de filtrado
- **THEN** solo existe el buscador por nombre
- **AND** los filtros por prioridad viven dentro del tablero, donde la tarea sí tiene esa dimensión

#### Scenario: La tarjeta señala el trabajo urgente
- **GIVEN** un proyecto con tareas de prioridad alta
- **WHEN** se mira su tarjeta en el panel
- **THEN** muestra cuántas son
- **AND** un proyecto sin tareas de prioridad alta no muestra ninguna señal

### Requirement: La tarjeta de proyecto abre el proyecto

#### Scenario: Pulsar en cualquier punto de la tarjeta
- **GIVEN** una tarjeta de proyecto
- **WHEN** se pulsa sobre el título, la descripción, el avance o el espacio libre
- **THEN** se abre el detalle del proyecto

#### Scenario: Los botones de la tarjeta no navegan
- **GIVEN** la misma tarjeta
- **WHEN** se pulsa «Editar» o «Eliminar»
- **THEN** se abre el diálogo correspondiente y **no** se navega
- **AND** los botones no son descendientes del enlace, porque un `<a>` no puede contener controles

#### Scenario: Seleccionar texto no navega
- **GIVEN** la descripción de un proyecto
- **WHEN** se arrastra el ratón sobre ella para seleccionarla y se suelta
- **THEN** el texto queda seleccionado y **no** se abre el proyecto

#### Scenario: La navegación sigue siendo la del navegador
- **GIVEN** la tarjeta
- **WHEN** se usa Ctrl/Cmd+clic, el clic central o «abrir en pestaña nueva»
- **THEN** el proyecto se abre en una pestaña nueva, porque es un `<a href>` real

#### Scenario: Orden de tabulación
- **GIVEN** la tarjeta
- **WHEN** se recorre con el tabulador
- **THEN** ofrece tres paradas: editar, eliminar y el enlace al proyecto
- **AND** el nombre accesible del enlace es «Abrir tareas de <nombre>», no el contenido de la tarjeta
