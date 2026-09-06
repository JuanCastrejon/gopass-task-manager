# Research: SL-07 — Automatización CI, Pruebas E2E y Calidad Ejecutable

## 1. Por qué usar el puerto 5433 en CI
En los runners de GitHub Actions (`ubuntu-latest`), un servicio nativo de PostgreSQL suele escuchar en el puerto 5432. Para evitar colisiones y asegurar paridad con el entorno local de `docker-compose.yml`, el servicio en el workflow de CI mapea `5433:5432`, alineándose exactamente con la variable de entorno `DATABASE_URL` de los proyectos.

## 2. Por qué dos escenarios específicos en E2E
Las 70+ pruebas unitarias y de integración cubren exhaustivamente controladores, esquemas y repositorios. Los tests E2E en Playwright se concentran en lo que solo un navegador real puede certificar:
1. Que el estado sobrevive a una recarga real (`page.reload()`) demostrando que los datos están en PostgreSQL y no en el estado en memoria de React.
2. Que el error HTTP 409 se intercepta y muestra de forma pedagógica en el diálogo sin destruir el proyecto ni sus tareas.
