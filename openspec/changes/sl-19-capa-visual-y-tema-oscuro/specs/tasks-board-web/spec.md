# Spec: SL-19 — Capa visual, tema y fondo de tablero

## ADDED Requirements

### Requirement: Tema claro/oscuro con preferencia persistente

La interfaz DEBE ofrecer tema claro y oscuro, y respetar la preferencia del sistema operativo
mientras el usuario no elija una explícita.

#### Scenario: Sin preferencia guardada se respeta la del sistema
- **WHEN** no hay preferencia en `localStorage`
- **THEN** el tema resuelto coincide con `prefers-color-scheme`

#### Scenario: La preferencia explícita gana y sobrevive a la recarga
- **WHEN** el usuario elige un tema y recarga
- **THEN** `<html>` lleva ese `data-theme` **antes del primer pintado**, sin destello

#### Scenario: Los tres estados del ciclo son alcanzables
- **WHEN** se pulsa el conmutador repetidamente desde cualquier estado inicial
- **THEN** se visitan `light`, `dark` y `system`, con el sistema en claro o en oscuro

### Requirement: Contraste AA en ambos temas

Todo par de texto sobre fondo DEBE alcanzar 4.5:1, y los indicadores de foco 3:1.

#### Scenario: Los pares derivados cumplen AA en oscuro
- **WHEN** se calculan los 6 pares semánticos y los 12 de etiqueta con `color-mix`
- **THEN** los 18 superan 4.5:1, con peor caso 5,85

### Requirement: Geometría estable de columnas

Las columnas DEBEN tener ancho fijo a partir de `lg` y desplazarse horizontalmente.

#### Scenario: Cuatro columnas en una pantalla ancha
- **WHEN** la ventana mide 1440 px
- **THEN** cada columna mide 272 px y el tablero usa el ancho real sin desbordar

#### Scenario: El carrusel móvil no cambia
- **WHEN** la ventana mide 390 px
- **THEN** se conserva una columna por pantalla y el cuerpo no desborda horizontalmente

### Requirement: Fondo de tablero por proyecto

Cada proyecto DEBE poder llevar un fondo de una paleta cerrada, impuesta por el motor.

#### Scenario: Valor fuera de la paleta
- **WHEN** se intenta escribir un fondo no permitido, desde la API o desde `psql`
- **THEN** el motor lo rechaza con `projects_background_check`

#### Scenario: Ningún texto se apoya sobre el fondo
- **WHEN** un proyecto tiene fondo de color, en cualquiera de los dos temas
- **THEN** todo texto queda sobre una superficie opaca, y no sobre el degradado
