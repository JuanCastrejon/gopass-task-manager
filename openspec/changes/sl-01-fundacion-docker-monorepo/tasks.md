# Tasks: Work Packages de Fundación

## 1. WP1 — Orquestación Docker Compose
- [x] 1.1 Configurar docker-compose.yml con servicio db (PostgreSQL 16 en 5433 con healthcheck).
- [x] 1.2 Configurar servicio pi con healthcheck HTTP y depends_on: db: condition: service_healthy.
- [x] 1.3 Configurar servicio web con Nginx y depends_on: api: condition: service_healthy.

## 2. WP2 — Esqueleto Backend
- [x] 2.1 Configurar pi/tsconfig.json en modo estricto sin ny.
- [x] 2.2 Crear pi/src/config/env.ts con validación Zod.
- [x] 2.3 Configurar pi/src/db/pool.ts con cliente pg.
- [x] 2.4 Implementar pi/src/app.ts y endpoint base GET /api/health (RF-15).

## 3. WP3 — Esqueleto Frontend
- [x] 3.1 Inicializar Vite + React 18 con TypeScript en web/.
- [x] 3.2 Configurar Tailwind CSS con tokens de color semánticos.
- [x] 3.3 Configurar cliente web/src/lib/api-client.ts con consumo relativo a /api.
- [x] 3.4 Configurar web/nginx.conf para servir SPA y reenviar /api a pi:3000.

## 4. WP4 — Calidad y Gobernanza Base
- [x] 4.1 Configurar scripts raíz en package.json (dev, uild, lint, 	est).
- [x] 4.2 Establecer huella sdlc adopt (.sdlc/config.json, phase-contract.yaml, quality-contract.yaml).
- [x] 4.3 Añadir adaptadores de calidad en scripts/quality-adapters/.
