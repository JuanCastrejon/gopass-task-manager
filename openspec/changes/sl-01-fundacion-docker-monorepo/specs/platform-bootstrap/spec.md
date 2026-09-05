## ADDED Requirements

### Requirement: Arranque reproducible con un solo comando

El sistema completo —base de datos, API y web— se levanta sin pasos manuales previos.

#### Scenario: Clon limpio en una máquina sin estado previo
- **GIVEN** un clon del repositorio en un directorio nuevo y sin `.env`
- **WHEN** se ejecuta `docker compose up --build`
- **THEN** los tres servicios quedan en estado `healthy`
- **AND** la aplicación responde en `http://localhost:5173`

#### Scenario: El puerto 5432 del host está ocupado
- **GIVEN** otra instancia de PostgreSQL escuchando en el 5432 del host
- **WHEN** se levanta el stack
- **THEN** el arranque no falla, porque la base publica en `5433:5432`

### Requirement: La API no arranca antes que su base de datos

#### Scenario: PostgreSQL tarda en aceptar conexiones
- **GIVEN** el servicio `db` todavía inicializando
- **WHEN** Docker Compose evalúa `depends_on`
- **THEN** el servicio `api` no arranca hasta que la sonda `pg_isready` pasa

### Requirement: Sonda de salud que informa de la dependencia real (RF-15)

#### Scenario: Base de datos accesible
- **GIVEN** la API corriendo con PostgreSQL disponible
- **WHEN** se pide `GET /api/health`
- **THEN** responde `200` con `status: "ok"` y `database: "up"`

#### Scenario: Base de datos caída
- **GIVEN** la API corriendo sin conexión a PostgreSQL
- **WHEN** se pide `GET /api/health`
- **THEN** responde `503` con `database: "down"`, no un `200` engañoso
