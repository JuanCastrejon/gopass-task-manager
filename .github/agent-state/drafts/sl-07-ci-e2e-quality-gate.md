## Contexto & Problem Statement

Con la implementación completa del backend en Express/PostgreSQL (proyectos y tareas con máquina de estados) y el frontend reactivo en React 18/Vite (panel analítico y tablero Kanban), el proyecto requiere un marco de aseguramiento continuo de la calidad (QA) y automatización de entrega.

Para garantizar que ningún cambio futuro degrade las reglas de negocio, la integridad de datos o la experiencia de usuario, es necesario establecer:
1. Pruebas End-to-End (E2E) con Playwright que certifiquen el ciclo de vida completo de extremo a extremo y la comunicación transparente de conflictos de negocio (HTTP 409).
2. Un pipeline de CI en GitHub Actions que levante una base de datos PostgreSQL real, ejecute linting, typechecking, pruebas unitarias e integración y valide la compilación de producción.
3. Un contrato ejecutable de calidad (`quality-contract.yaml` y `phase-contract.yaml`) con supervisión independiente de cobertura e invariantes de arquitectura.

## Requisitos Funcionales Vinculados

- **RF-15:** Contenerización y reproductibilidad del entorno de desarrollo y pruebas automatizadas (Docker Compose + GitHub Actions con servicio PostgreSQL 16 aislado).
- **RF-16:** Semillado de datos determinista y trazabilidad de pruebas automatizadas en todos los niveles (Unit, Integration, E2E).
- **Invariante de Negocio (RF-07, RF-10):** Verificación de persistencia real post-recarga y confirmación visual del conflicto 409 (`PROJECT_HAS_TASKS`) en el navegador.

---

## User Stories & Acceptance Criteria

### US-01: Verificación End-to-End del Ciclo de Vida de Tareas (E2E-01)
*Como ingeniero de confiabilidad y calidad de software,*
*quiero certificar que las tareas creadas sobreviven a una recarga completa del navegador en su columna correcta,*
*para demostrar que el estado reside en PostgreSQL y no de forma efímera en la memoria de React.*

- **AC-01.1:** El test crea un proyecto con nombre único determinista, accede a su vista de detalle y añade una tarea en la columna "Por hacer".
- **AC-01.2:** Transiciona la tarea a "En curso" y luego a "Completada", verificando que la barra de avance del proyecto sube al 100% (1 de 1 completadas).
- **AC-01.3:** Ejecuta un refresco completo de la página (`page.reload()`) y valida que la tarjeta permanece en la columna "Completada" con la barra de progreso al 100%.

### US-02: Verificación E2E de Conflicto de Borrado 409 Pedagógico (E2E-02)
*Como auditor de experiencia de usuario y arquitectura,*
*quiero validar que el diálogo de borrado no destruye datos cuando existen tareas asociadas,*
*para confirmar que el error HTTP 409 es interpretado y mostrado pedagógicamente al usuario.*

- **AC-02.1:** El test crea un proyecto con una tarea asociada e intenta eliminar el proyecto.
- **AC-02.2:** Al confirmar la eliminación, el diálogo intercepta el 409 de la API y muestra una alerta roja con el mensaje explicativo (`PROJECT_HAS_TASKS`).
- **AC-02.3:** Al cancelar el diálogo, el test certifica que ni el proyecto ni la tarea fueron destruidos, apareciendo intactos en la vista general.

### US-03: Pipeline de Integración Continua Automatizado (CI-01)
*Como desarrollador del equipo de ingeniería,*
*quiero que cada commit y pull request en `develop` y `main` se valide automáticamente en GitHub Actions,*
*para detectar regresiones antes del despliegue a producción.*

- **AC-03.1:** El runner levanta un contenedor `postgres:16-alpine` en el puerto 5433 con healthcheck determinista (`pg_isready`).
- **AC-03.2:** Ejecuta linters (`npm run lint`), verificación de tipos (`npm run typecheck`), pruebas de backend contra PostgreSQL (`npm --prefix api run test:coverage`), pruebas de frontend (`npm --prefix web test`) y build de producción (`npm run build`).
- **AC-03.3:** Instala dependencias de Chromium y ejecuta los escenarios Playwright E2E contra los servidores de desarrollo de la aplicación.
- **AC-03.4:** Genera y publica evidencias de cobertura y reportes de prueba en caso de fallo.

### US-04: Contrato de Gobernanza y Quality Gate Ejecutable (QG-01)
*Como Lead Architect,*
*quiero un contrato de calidad explícito y verificable por máquina,*
*para gobernar la evolución del código sin depender de declaraciones manuales.*

- **AC-04.1:** Se define `quality-contract.yaml` con niveles de superficie (`core` para `api`, `shell` para `web`), reglas de ratchet y umbrales de cobertura.
- **AC-04.2:** Se define `phase-contract.yaml` estructurando las fases del ciclo de vida SDD (F0 a F17) y sus salidas obligatorias.
- **AC-04.3:** Se enlaza el probe `validate:coverage` con reporte estandarizado Istanbul summary.

---

## Technical Design & Architectural Invariants

### 1. Aislamiento de Puertos en CI (5433 vs 5432)
En runners de GitHub Actions (`ubuntu-latest`), el puerto estándar 5432 puede estar ocupado por un servicio preinstalado en la imagen base. El workflow estandariza el puerto `5433` (idéntico al de `docker-compose.yml`), mapeando la variable `DATABASE_URL: postgres://gopass:gopass@localhost:5433/gopass_tasks` para garantizar predictibilidad total.

### 2. Ejecución E2E Determinista y Headless
- `playwright.config.ts` utiliza un único worker (`workers: 1`, `fullyParallel: false`) para evitar colisiones entre pruebas que operan sobre la misma base de datos.
- El servidor `webServer` levanta concurrentemente API y Frontend mediante `npm run dev` con sonda activa en `http://localhost:5173`.
- Cada prueba genera sufijos dinámicos (`Date.now().toString(36)`) para garantizar unicidad en nombres de proyectos y evitar falsos 409 por el índice único de base de datos.

---

## Work Breakdown Structure (WBS)

- **WP1 — Configuración y Escenarios Playwright E2E:**
  - `playwright.config.ts`: configuración con `webServer`, reporter y timeout de 30s.
  - `e2e/ciclo-de-vida.spec.ts`: flujo completo de proyecto, tarea, transiciones y recarga real.
  - `e2e/conflicto-de-borrado.spec.ts`: validación en navegador del 409 pedagógico y preservación de datos.
- **WP2 — Contratos de Calidad y Gobernanza SDD:**
  - `quality-contract.yaml`: contrato v1 con definición de superficies y umbrales.
  - `phase-contract.yaml`: contrato de fases F0 a F17.
  - `.sdlc/config.json`: configuración de gobierno del repositorio.
- **WP3 — Pipeline de CI en GitHub Actions:**
  - `.github/workflows/ci.yml`: workflow con servicio PostgreSQL 16, lint, typecheck, coverage, tests E2E y quality gate.
- **WP4 — Verificación Integral:**
  - Ejecución de la suite completa de pruebas unitarias, de integración y E2E.

---

## Verification Plan

| Escenario | Método de Verificación | Resultado Esperado |
|---|---|---|
| Playwright E2E Ciclo de Vida | `npx playwright test e2e/ciclo-de-vida.spec.ts` | 1/1 passed (persistencia tras recarga confirmada) |
| Playwright E2E Conflicto 409 | `npx playwright test e2e/conflicto-de-borrado.spec.ts` | 1/1 passed (alerta roja y datos intactos) |
| Cobertura de Backend | `npm --prefix api run test:coverage` | Cobertura generada en `coverage/coverage-summary.json` |
| Pruebas Unitarias Frontend | `npm --prefix web test` | 7/7 tests passing |
| Chequeo de Tipos | `npm run typecheck` | 0 errores en API y Frontend |
| Build de Producción | `npm run build` | Builds de API (`dist/`) y Web (`dist/`) exitosos |
