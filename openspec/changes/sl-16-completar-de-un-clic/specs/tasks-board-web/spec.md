## ADDED Requirements

### Requirement: Completar una tarea con un solo clic desde la tarjeta

#### Scenario: Completar tarea con una sola columna de categoría DONE
- **GIVEN** una tarea en una columna no terminal y un tablero con exactamente una columna de categoría `DONE`
- **WHEN** el usuario pulsa el control de completado de la tarjeta
- **THEN** la tarea se traslada inmediatamente a dicha columna `DONE`
- **AND** su estado pasa a `DONE` con `completed_at` sellado por el motor de base de datos
- **AND** la barra de avance del proyecto se incrementa reflejando la tarea completada
- **AND** el cambio sobrevive a una recarga completa de la página

#### Scenario: Completar tarea con múltiples columnas de categoría DONE
- **GIVEN** una tarea en una columna no terminal y un tablero con dos o más columnas de categoría `DONE`
- **WHEN** el usuario pulsa el control de completado
- **THEN** se despliega un menú accesible con la lista de columnas de categoría `DONE` disponibles
- **AND** el foco viaja automáticamente al primer destino del menú
- **AND** el sistema no toma ninguna decisión automática sobre cuál columna elegir
- **WHEN** el usuario selecciona una de las columnas del menú
- **THEN** la tarea se mueve a la columna seleccionada y el menú se cierra

#### Scenario: Cancelación del menú con tecla Escape
- **GIVEN** el menú de selección de columnas `DONE` abierto
- **WHEN** el usuario pulsa la tecla `Escape`
- **THEN** el menú se cierra sin mover la tarjeta
- **AND** el foco regresa de inmediato al botón disparador de completado

### Requirement: Semántica accesible e indicador de estado no interactivo

#### Scenario: Semántica de botón convencional
- **GIVEN** una tarea no completada
- **THEN** el control de completado es un elemento `<button type="button">` nativo
- **AND** no declara `role="checkbox"` ni `aria-pressed`, dado que su efecto es trasladar la tarjeta a otro contenedor

#### Scenario: Tarjeta en columna de categoría DONE
- **GIVEN** una tarea que ya se encuentra en una columna de categoría `DONE`
- **THEN** el círculo de verificación se renderiza en verde con icono de check como indicador de estado puramente informativo
- **AND** no posee interactividad, no es un botón ni recibe foco por tabulación
- **AND** expone un texto accesible `<span className="sr-only">Completada</span>` para lectores de pantalla
- **AND** la tarjeta conserva el botón de flecha hacia la columna anterior para reabrirla con un solo clic
