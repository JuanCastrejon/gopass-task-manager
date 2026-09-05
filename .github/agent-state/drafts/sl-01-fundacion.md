> **Publicado como** https://github.com/JuanCastrejon/gopass-task-manager/issues/1 el 2026-09-05.

---

---
slice: sl-01-fundacion-docker-monorepo
phase: F3 (local-issue-validation)
readiness: L1 - Infrastructure
origin_draft: openspec/changes/sl-01-fundacion-docker-monorepo/proposal.md
---

# Issue: Fundación del proyecto, Docker Compose y monorepo (RF-15)

## Qué se pide de este Issue
Aprobar la arquitectura de fundación del proyecto antes de introducir lógica de dominio:
1. Orquestación con docker-compose.yml verificada: PostgreSQL 16 expuesto en puerto de host 5433 (para prevenir colisión con PostgreSQL 5432 local), API Express en puerto 3000 y Web en puerto 5173 vía Nginx.
2. Salud del sistema y arranque confiable: Sondas de salud en BD (pg_isready) y API (GET /api/health, cubriendo RF-15).
3. Transparencia de red: Rutas relativas /api en el cliente con proxy en Vite (dev) y Nginx (prod), eliminando la necesidad de CORS.
4. Gobernanza pragmática: Adopción del arnés sdlc adopt (4 archivos de contrato).

## Criterios de Aceptación
- [ ] docker compose up --build levanta los tres contenedores en estado healthy.
- [ ] curl -i http://localhost:3000/api/health responde HTTP 200 con estado de PostgreSQL.
- [ ] http://localhost:5173 renderiza el esqueleto web sin errores en consola.
- [ ] 
pm run lint y 
pm run build pasan en pi y web.
