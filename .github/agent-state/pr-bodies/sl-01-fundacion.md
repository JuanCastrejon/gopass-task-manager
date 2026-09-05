## Resumen

Este Pull Request implementa la fundación de infraestructura y monorepo para la aplicación **GoPass Task Manager**, cubriendo el hito **SL-01** y resolviendo el Issue #1. Establece la base sobre la cual se construirán los slices de dominio, garantizando reproducibilidad y cero configuración manual.

Resolves #1

## Paquetes de Trabajo Implementados

- **WP1 — Orquestación Docker Compose:**
  - Servicio de base de datos PostgreSQL 16 con mapeo de puerto en host a `5433:5432` para evitar colisiones con instancias locales preexistentes.
  - Sonda de salud `pg_isready` y dependencia estricta `condition: service_healthy` para prevenir condiciones de carrera en el arranque de la API.
  - Servicio `web` con Nginx que actúa como proxy reverso para `/api` hacia el contenedor `api:3000`.
- **WP2 — Esqueleto Backend (`api/`):**
  - TypeScript estricto con validación de entorno en tiempo de arranque mediante Zod (`api/src/config/env.ts`).
  - Pool de conexiones PostgreSQL parametrizado (`api/src/db/pool.ts`).
  - Endpoint de sondeo del sistema `GET /api/health` verificando conexión activa a la BD (RF-15).
- **WP3 — Esqueleto Frontend (`web/`):**
  - Vite + React 18 + Tailwind CSS con paleta semántica curada.
  - TanStack Query para gestión de estado asíncrono y `api-client.ts` consumiendo rutas relativas `/api`.
  - Vista inicial de diagnóstico que valida el cableado de punta a punta: Navegador → Proxy → Express → PostgreSQL.
- **WP4 — Gobernanza y Trazabilidad:**
  - Especificación formal del cambio en `openspec/changes/sl-01-fundacion-docker-monorepo/` (proposal, research, design, tasks).
  - Borrador formal en `.github/agent-state/drafts/sl-01-fundacion.md` vinculado a Issue #1.
  - Adopción pragmática del arnés de calidad `sdlc adopt` con rama de integración `develop`.

## Evidencia de Verificación

| Verificación | Comando | Resultado |
|---|---|---|
| Salud de la API (RF-15) | `GET /api/health` | HTTP 200 con estado de PostgreSQL |
| Consumo relativo | `GET /api/health` desde Vite proxy | Conexión establecida sin CORS |
| Tipado estricto | `npm run typecheck` | 0 errores en api y web |
| Readiness | Clasificación F3 | L1 - Infrastructure |
