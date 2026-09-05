# Research: Fundación del Monorepo y Docker Compose

## 1. Diagnóstico de Riesgos de Ejecución Local

En entornos de evaluación técnica de desarrolladores Fullstack, los evaluadores prueban los repositorios en sus propias estaciones de trabajo. Tres fallos recurrentes arruinan la primera impresión:
1. **Puerto 5432 ocupado:** Si el evaluador tiene un servicio de PostgreSQL corriendo localmente en Windows/macOS/Linux, docker compose up falla de inmediato con ind: address already in use.
   * *Solución comprobada:* Mapear en host ${POSTGRES_PORT:-5433}:5432. El contenedor usa el 5432 internamente, pero el host expone el 5433 por defecto, eliminando la colisión.
2. **Condición de carrera API <-> DB:** Si la API arranca apenas el contenedor de BD inicia (depends_on: [db]), la base aún no ha terminado de inicializar sus procesos internos (database system is ready to accept connections), produciendo fallos de conexión intermitentes.
   * *Solución comprobada:* Configurar healthcheck en db con pg_isready y condicionar el arranque de la API a depends_on: db: condition: service_healthy.
3. **Fricción de CORS:** Configurar cabeceras CORS permisivas o quemar http://localhost:3000 en el código cliente de React crea diferencias de comportamiento entre local, Docker y producción.
   * *Solución comprobada:* El frontend siempre pide a la ruta relativa /api/.... En desarrollo, Vite reenvía mediante server.proxy: { '/api': 'http://localhost:3000' }. En producción (Docker), Nginx hace proxy_pass http://api:3000. Cero cabeceras CORS requeridas.

## 2. Validación de Entorno en Arranque con Zod

Arrancar una API que falla silenciosamente o en la primera petición HTTP cuando falta una variable de entorno es pésima experiencia de depuración. 
* Implementamos pi/src/config/env.ts con Zod. Si falta DATABASE_URL o algún puerto es inválido, el proceso imprime un error legible con los campos exactos y hace process.exit(1) de inmediato antes de abrir puertos.

## 3. Calibración de Gobernanza (SDLC Adopt)

Se analizó la experiencia previa donde un comando sdlc init --mode greenfield inyectó 286 archivos en el árbol. Para este proyecto:
* Usamos sdlc adopt, que solo agrega 4 archivos de especificación (.sdlc/config.json, phase-contract.yaml, quality-contract.yaml, schemas/phase-evidence.schema.json) y adaptadores en scripts/quality-adapters/.
* Esto otorga un quality gate verificable en CI sin ocultar el código fuente del postulante bajo capas excesivas de andamiaje.
