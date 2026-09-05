# Proposal: SL-08 — Documentación Técnica Exhaustiva, ADRs, Colección API y Manual Operativo

## Why

Para asegurar la máxima transparencia operativa, comprensibilidad y mantenibilidad de GoPass Task Manager, se requiere consolidar la documentación de referencia: un README ejecutivo de alto impacto, el registro formal de los 20 Architectural Decision Records (ADRs), especificaciones de requisitos y modelo de dominio, mediciones empíricas contra PostgreSQL 16 y la suite de peticiones HTTP ejecutables.

## What Changes

- **WP1 - README Ejecutivo y Assets (`README.md`, `docs/assets/`):**
  - Guía de inicio rápido en 1 comando (`docker compose up --build`).
  - Síntesis de las 5 decisiones centrales y arquitectura de 3 capas.
  - Métricas de calidad consolidadas (78 pruebas, 93.8% cobertura, 0 errores de tipado).
- **WP2 - Especificaciones Técnicas (`docs/spec/`):**
  - `01-requisitos.md`: Requisitos funcionales y no funcionales con criterios de aceptación.
  - `02-modelo-dominio.md`: DDL relacional, tipos ENUM e invariantes.
  - `03-contrato-api.md`: Formato RFC 7807, catálogo de códigos y mapeo SQLSTATE.
  - `04-arquitectura.md`: 20 ADRs con contexto, decisiones y alternativas.
  - `05-estrategia-calidad.md`: Pirámide de pruebas, matriz de trazabilidad y quality gate.
  - `08-verificacion-postgres.md`: Mediciones directas contra el motor.
- **WP3 - Colección de Pruebas API (`docs/api.http`):**
  - Colección ejecutable para REST Client cubriendo operaciones y códigos de error.
- **WP4 - Proceso y Herramientas (`docs/process/`, `scripts/`, `schemas/`):**
  - Guía metodológica y scripts de adaptación de métricas.

## Business Fit y KPIs

| Criterio | Objetivo | Verificación |
|---|---|---|
| Tiempo de puesta en marcha | < 2 minutos con Docker | `docker compose up --build` probado |
| Trazabilidad de decisiones | 20 ADRs formales documentados | `docs/spec/04-arquitectura.md` |
| Cobertura de requerimientos | 100% de RF-01 a RF-16 mapeados | `docs/spec/01-requisitos.md` |
| Calidad de entrega | 0 inconsistencias de tipos o links | Validación continua |

## Perfil de Readiness

`L4 - Production Release & Enterprise Documentation`. Documentación completa y sistema listo para despliegue.
