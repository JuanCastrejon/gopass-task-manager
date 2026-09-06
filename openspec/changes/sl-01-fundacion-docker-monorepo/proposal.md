## Why

Para cumplir el requisito central de la prueba técnica de GoPass («Muestra tu criterio. La presentación también es parte de la prueba»), el sistema debe garantizar reproducibilidad absoluta desde un clon limpio. La causa número uno de fallo en revisiones de pruebas técnicas es que el software no arranca en la máquina del evaluador (puerto 5432 colisionado, condiciones de carrera entre BD y API, errores de CORS o variables de entorno no documentadas).

Este slice establece la fundación técnica completa antes de tocar cualquier lógica de negocio, asegurando arranque en un comando (docker compose up --build), tipado estricto sin ny y un arnés de calidad pragmático.

## What Changes

- **WP1 — Orquestación Docker Compose:** Definición de servicios db (PostgreSQL 16 en puerto host 5433 con healthcheck pg_isready), pi (Express en puerto 3000 dependiente de db: service_healthy) y web (Vite + Nginx en puerto 5173 dependiente de pi: service_healthy).
- **WP2 — Esqueleto Backend (pi/):** TypeScript estricto, Express, validación de entorno con Zod en arranque (pi/src/config/env.ts), pool pg (pi/src/db/pool.ts), y endpoint de sondeo GET /api/health (RF-15).
- **WP3 — Esqueleto Frontend (web/):** React 18, Vite, Tailwind CSS con paleta semántica curada, TanStack Query y proxy de desarrollo hacia /api. Nginx para servir el build de producción en contenedor.
- **WP4 — Gobernanza Pragmática (sdlc adopt):** Adopción ligera de contratos de calidad (quality-contract.yaml, phase-contract.yaml) con la devDependency sistema-multiagente-sdlc@2.2.2, evitando sobrecargar el repositorio con artefactos innecesarios.

## Business Fit y KPIs

| Criterio | Objetivo | Verificación |
|---|---|---|
| Arranque en 1 comando | docker compose up --build sin pasos manuales | Contenedores quedan healthy |
| Ausencia de colisión de puerto DB | Mapeo 5433:5432 en host | No colisiona con PostgreSQL local estándar |
| Contrato de salud (RF-15) | GET /api/health responde 200 con estado de BD | curl directo / healthcheck de docker |
| Cero CORS en cliente | Consumo por ruta relativa /api | Proxy de Vite (dev) y Nginx (prod) |
| Huella de gobernanza | Modo dopt (4 archivos de contrato) | Sin carpetas pesadas de agentes |

## Perfil de readiness

L1 - Exploratory/Infrastructure. No introduce lógica de negocio ni migraciones de datos; prepara la tubería de ejecución y calidad.
