# Proposal: SL-04 — Panel de Proyectos, Métricas y Diálogo de Borrado con Manejo del Error 409

## Why

Para gobernar proyectos de desarrollo de forma interactiva y accesible, el frontend de GoPass Task Manager requiere una interfaz de usuario reactiva en React 18, Vite y Tailwind CSS v4 que presente métricas de avance en tiempo real, gestione la creación/edición sin parpadeos visuales y eduque activamente al usuario ante la regla de integridad de negocio (HTTP 409 `PROJECT_HAS_TASKS`).

## What Changes

- **WP1 - Sistema de Diseño y Componentes Atómicos (`web/src/components/ui/`):**
  - `Button.tsx`, `Badge.tsx`, `ProgressBar.tsx` (ARIA compliant), `Modal.tsx` (focus trap), `States.tsx` (skeletons y empty states).
- **WP2 - Panel Analítico de Métricas (`web/src/features/dashboard/StatsPanel.tsx`):**
  - Tarjetas KPI consumiendo `GET /api/stats` con barras de distribución por estado y prioridad.
- **WP3 - Módulo de Proyectos (`web/src/features/projects/`):**
  - `ProjectsPage.tsx` con grilla responsiva, `ProjectCard.tsx`, `ProjectFormDialog.tsx` (crear/editar parcial con soporte de null).
  - `DeleteProjectDialog.tsx` que ilustra y captura pedagógicamente el error 409 en lenguaje de usuario.
- **WP4 - Enrutamiento y Gestión de Errores (`web/src/lib/`):**
  - Enrutador liviano accesible con restauración de foco en `<main>` (`router.tsx`, `App.tsx`).
  - Traducción determinista de errores RFC 7807 en `error-messages.ts` y pruebas unitarias en `error-messages.test.ts`.

## Business Fit y KPIs

| Criterio | Objetivo | Verificación |
|---|---|---|
| Manejo del error 409 | Explicación pedagógica en diálogo modal | `DeleteProjectDialog.tsx` |
| Parpadeo visual | Cero parpadeos en recargas | `isPending` con TanStack Query |
| Restauración de foco | Foco llevado a `<main>` en cambios de ruta | `App.tsx` con `useRef` |
| Cobertura unitaria de frontend | 7 tests en verde | `npm --prefix web test` |

## Perfil de Readiness

`L2 - User Experience & Client State`. Implementa la capa visual, integración con la API de proyectos y manejo de estados asíncronos.
