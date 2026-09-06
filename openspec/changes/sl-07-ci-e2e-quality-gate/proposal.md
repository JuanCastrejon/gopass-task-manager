# Proposal: SL-07 — Pipeline de Integración Continua, Pruebas E2E y Quality Gate

## Why

Para asegurar que el sistema preserve su comportamiento esperado, la integridad transaccional de PostgreSQL y la experiencia de usuario a lo largo de futuros cambios, se requiere un pipeline de CI en GitHub Actions con base de datos real, una suite de pruebas End-to-End con Playwright y un contrato ejecutable de calidad y gobernanza SDD.

## What Changes

- **WP1 - Pruebas End-to-End con Playwright (`playwright.config.ts`, `e2e/`):**
  - `e2e/ciclo-de-vida.spec.ts`: Creación, avance a completada y supervivencia tras recarga completa en navegador.
  - `e2e/conflicto-de-borrado.spec.ts`: Intercepción visual del 409 pedagógico y preservación de datos.
- **WP2 - Contratos de Calidad y Gobernanza SDD (`quality-contract.yaml`, `phase-contract.yaml`, `.sdlc/`):**
  - Definición formal de superficies (`core` para API, `shell` para Web), umbrales de cobertura y flujo de fases F0 a F17.
- **WP3 - Pipeline de CI en GitHub Actions (`.github/workflows/ci.yml`):**
  - Contenedor `postgres:16-alpine` en puerto 5433.
  - Pasos ordenados: lint, typecheck, tests de backend con coverage, tests de frontend, build y tests E2E.

## Business Fit y KPIs

| Criterio | Objetivo | Verificación |
|---|---|---|
| Aislamiento de entorno | 100% pruebas contra PostgreSQL real | Runner GitHub Actions con servicio postgres |
| Cobertura de flujos críticos | 2 escenarios E2E automatizados | Playwright con Chromium |
| Trazabilidad de fallos | Reporte HTML y trazas en CI | Artifact upload en GitHub Actions |
| Cumplimiento normativo | Cero roturas de contrato | Quality gate automatizado |

## Perfil de Readiness

`L3 - Automated CI/CD & E2E Validation`. Entorno de pruebas completamente automatizado con integración continua.
