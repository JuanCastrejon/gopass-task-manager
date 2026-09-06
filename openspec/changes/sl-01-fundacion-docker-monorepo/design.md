# Design: Arquitectura del Monorepo y Cableado de Infraestructura

## 1. Estructura de Directorios

`
gopass-task-manager/
├── api/                     # Backend Node.js / Express
│   ├── src/
│   │   ├── config/env.ts    # Zod schema para variables de entorno
│   │   ├── db/pool.ts       # Conexión pg Pool
│   │   ├── app.ts           # Configuración Express
│   │   └── server.ts        # Entrypoint (desacoplado de listen)
│   ├── Dockerfile
│   └── package.json
├── web/                     # Frontend React 18 / Vite
│   ├── src/
│   │   ├── lib/api-client.ts # Fetch wrapper hacia /api
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── nginx.conf           # Proxy reverso SPA + /api
│   └── package.json
├── docs/                    # Especificaciones y contratos
├── openspec/                # Trazabilidad SDD (changes, specs)
├── scripts/                 # Adaptadores de calidad
├── docker-compose.yml       # Orquestación multicontenedor
└── package.json             # Scripts raíz (dev, test, lint)
`

## 2. Contrato de Salud (RF-15)

- **Endpoint:** GET /api/health
- **Respuesta 200 OK:**
  `json
  {
     status: pass,
    timestamp: 2026-09-05T15:00:00.000Z,
    postgres: {
      status: connected,
      latencyMs: 2
    }
  }
  `
- **Respuesta 503 Service Unavailable:** Si la consulta SELECT 1 a PostgreSQL falla o supera timeout.
