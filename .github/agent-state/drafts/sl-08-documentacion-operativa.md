## Contexto & Problem Statement

Con las capas de persistencia (PostgreSQL 16), backend (Express/TypeScript), frontend (React 18/Vite) y aseguramiento de calidad (CI/CD, 76 pruebas automáticas y Playwright E2E) totalmente integradas y validadas en `develop`, el proyecto requiere la consolidación de su **documentación técnica exhaustiva y manual de operaciones**.

Para que cualquier ingeniero, arquitecto o evaluador pueda comprender de inmediato el diseño, ejecutar el sistema sin fricción en un solo comando y auditar las decisiones arquitectónicas que sustentan la solución, es necesario incorporar:
1. Un `README.md` ejecutivo de alto impacto visual con badges de build/calidad, diagrama de arquitectura, guía de inicio rápido en un comando (`docker compose up --build`), resumen de endpoints y métricas consolidadas.
2. El registro exhaustivo de especificaciones técnicas (`docs/spec/`) con los 20 Architectural Decision Records (ADRs), modelo relacional DDL, contrato de API RFC 7807 y mediciones empíricas contra el motor PostgreSQL 16.
3. La colección de peticiones ejecutables `docs/api.http` para pruebas manuales inmediatas con REST Client.
4. El documento metodológico de ingeniería `docs/process/ai-assisted-development.md` y los scripts de soporte operativo.

## Requisitos Funcionales y Técnicos Vinculados

- **RF-01 a RF-16:** Cobertura documental y trazabilidad completa de todos los requisitos del producto.
- **RF-15:** Guía de ejecución con Docker Compose y desarrollo local fuera de contenedores.
- **RNF-01 a RNF-10:** Documentación de estándares de rendimiento, accesibilidad WCAG 2.1 AA, integridad referencial y contratos de error RFC 7807.

---

## User Stories & Acceptance Criteria

### US-01: Documentación Ejecutiva y Manual de Inicio Rápido (DOC-01)
*Como ingeniero de software u operador que clona el repositorio por primera vez,*
*quiero un README claro, visual y estructurado,*
*para entender el propósito del sistema y levantarlo localmente en menos de 2 minutos sin dependencias externas complejas.*

- **AC-01.1:** El `README.md` presenta el resumen ejecutivo del proyecto con capturas reales de la interfaz (`docs/assets/panel.png`, `docs/assets/tablero.png`).
- **AC-01.2:** Detalla el comando de arranque universal (`docker compose up --build`) con enlace a `http://localhost:5173`.
- **AC-01.3:** Sintetiza las 5 decisiones críticas de diseño (borrado 409 restrict, verificación en motor, desambiguación de SQLSTATE 23503, trigger de `completed_at` y arquitectura sin ORM/router pesado).
- **AC-01.4:** Presenta el diagrama ASCII de arquitectura de 3 capas y la matriz de endpoints con su código HTTP esperado.

### US-02: Registro de Decisiones de Arquitectura y Especificaciones (DOC-02)
*Como Lead Architect o auditor técnico,*
*quiero consultar los ADRs formales y el modelo de datos detallado,*
*para comprender las alternativas descartadas, los trade-offs evaluados y las restricciones de PostgreSQL.*

- **AC-02.1:** `docs/spec/04-arquitectura.md` contiene 20 ADRs exhaustivos con contexto, decisión, alternativas descartadas y consecuencias.
- **AC-02.2:** `docs/spec/02-modelo-dominio.md` documenta el DDL completo, las invariantes relacionales y la justificación de tipos nativos (`ENUM`).
- **AC-02.3:** `docs/spec/03-contrato-api.md` documenta los esquemas de entrada/salida, los códigos de error RFC 7807 y la tabla de mapeo `SQLSTATE` ➔ HTTP.
- **AC-02.4:** `docs/spec/08-verificacion-postgres.md` incluye las salidas de consola y mediciones empíricas contra PostgreSQL 16.

### US-03: Colección de Pruebas HTTP Ejecutables (DOC-03)
*Como desarrollador que prueba o depura la API,*
*quiero un archivo `.http` ejecutable con todas las operaciones del ciclo de vida,*
*para interactuar con el backend sin necesidad de configurar herramientas externas de terceros.*

- **AC-03.1:** `docs/api.http` contiene peticiones parametrizadas con variables (`@baseUrl`, `@projectId`, `@taskId`).
- **AC-03.2:** Cubre la creación, consulta, edición parcial, filtros combinados y el flujo de intento de borrado con 409.

### US-04: Metodología de Desarrollo y Gobernanza de Calidad (DOC-04)
*Como equipo de ingeniería,*
*quiero dejar constancia del estándar metodológico aplicado,*
*para garantizar la reproducibilidad y transparencia del ciclo de vida del software.*

- **AC-04.1:** `docs/process/ai-assisted-development.md` describe el ciclo de diseño previo a la codificación, la auditoría adversarial y el uso del contrato de calidad en CI.
- **AC-04.2:** Se incluyen los scripts de soporte en `scripts/` y los esquemas JSON de evidencia en `schemas/`.

---

## Technical Design & Architectural Invariants

### 1. Enlaces Relativos y Portabilidad
Todos los hipervínculos dentro de la documentación (`README.md` y `docs/`) utilizan rutas relativas universales, asegurando una navegación fluida tanto en el visor de GitHub como en IDEs locales (VS Code, JetBrains, etc.).

### 2. Tono y Redacción Corporativa Rigurosa
Toda la documentación mantiene una narrativa corporativa estricta enfocada en ingeniería de producto, arquitectura de software, calidad observable y rendimiento, sin referencias meta a evaluaciones ni procesos de selección.

---

## Work Breakdown Structure (WBS)

- **WP1 — `README.md` Central y Assets:**
  - Redacción ejecutiva, diagramas de capas, guía Docker y resumen de endpoints.
  - Copia de capturas de pantalla a `docs/assets/`.
- **WP2 — Especificaciones Técnicas (`docs/spec/`):**
  - Requisitos (`01-requisitos.md`), Modelo de dominio (`02-modelo-dominio.md`), Contrato de API (`03-contrato-api.md`), Arquitectura y 20 ADRs (`04-arquitectura.md`), Estrategia de calidad (`05-estrategia-calidad.md`), Verificación de motor (`08-verificacion-postgres.md`) e índice (`README.md`).
- **WP3 — Colección API HTTP (`docs/api.http`):**
  - Colección ejecutable para REST Client con cobertura de flujos felices y caminos de error.
- **WP4 — Metodología y Scripts:**
  - `docs/process/ai-assisted-development.md`, `scripts/capturas.mjs`, `scripts/quality-adapters/`, `schemas/`.
- **WP5 — Verificación y Compilación Final:**
  - Chequeo de integridad de enlaces y validación de build de producción.

---

## Verification Plan

| Escenario | Método de Verificación | Resultado Esperado |
|---|---|---|
| Renderizado de `README.md` | Vista previa markdown | Diagramas, tablas y enlaces visualmente impecables |
| Navegación de Especificaciones | Click en enlaces de `docs/spec/` | Todos los archivos existen y renderizan correctamente |
| Colección `api.http` | Inspección de sintaxis HTTP | Peticiones RFC 7230 válidas con variables reutilizables |
| Build Integral | `npm run build` | API y Web compilan sin advertencias ni errores |
| Chequeo de Tipos | `npm run typecheck` | 0 errores en ambos proyectos |
