import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'GoPass Task Manager API',
    version: '1.0.0',
    description:
      'API REST para la gestión integral de proyectos y tareas con cálculo de avance en PostgreSQL y contratos de error RFC 7807.',
  },
  servers: [{ url: '/api', description: 'API Server' }],
  tags: [
    { name: 'Health', description: 'Sondas de salud del sistema' },
    { name: 'Projects', description: 'Operaciones CRUD de proyectos y avance' },
    { name: 'Stats', description: 'Métricas analíticas del panel' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Verificar salud del sistema y persistencia',
        responses: {
          200: {
            description: 'Sistema operativo',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    database: { type: 'string', example: 'up' },
                    uptime: { type: 'integer', example: 42 },
                  },
                },
              },
            },
          },
          503: {
            description: 'Servicio degradado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'degraded' },
                    database: { type: 'string', example: 'down' },
                    uptime: { type: 'integer', example: 42 },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/projects': {
      get: {
        tags: ['Projects'],
        summary: 'Listar proyectos con métricas de avance (RF-02)',
        responses: {
          200: {
            description: 'Listado de proyectos ordenados cronológicamente',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/ProjectSummary' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Projects'],
        summary: 'Crear nuevo proyecto (RF-01)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateProjectInput' },
            },
          },
        },
        responses: {
          201: {
            description: 'Proyecto creado exitosamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Project' },
              },
            },
          },
          400: {
            description: 'Error de validación de campos',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
          409: {
            description: 'Nombre de proyecto ya en uso',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
        },
      },
    },
    '/projects/{id}': {
      get: {
        tags: ['Projects'],
        summary: 'Obtener detalle de proyecto por ID (RF-03)',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          200: {
            description: 'Detalle del proyecto',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProjectSummary' },
              },
            },
          },
          404: {
            description: 'Proyecto no encontrado',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
        },
      },
      patch: {
        tags: ['Projects'],
        summary: 'Actualizar proyecto parcialmente (RF-04)',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PatchProjectInput' },
            },
          },
        },
        responses: {
          200: {
            description: 'Proyecto actualizado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Project' },
              },
            },
          },
          400: {
            description: 'Payload inválido o vacío',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
          404: {
            description: 'Proyecto no encontrado',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
          409: {
            description: 'Nombre en conflicto',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
        },
      },
      delete: {
        tags: ['Projects'],
        summary: 'Eliminar proyecto sin tareas (RF-05, RF-07)',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          204: { description: 'Proyecto eliminado exitosamente' },
          404: {
            description: 'Proyecto no encontrado',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
          409: {
            description: 'Conflicto: El proyecto tiene tareas asociadas (RF-07)',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
        },
      },
    },
    '/stats': {
      get: {
        tags: ['Stats'],
        summary: 'Obtener métricas globales del sistema',
        responses: {
          200: {
            description: 'Métricas analíticas consolidadas',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Stats' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Project: {
        type: 'object',
        required: ['id', 'name', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Telepeaje — integración de operadores' },
          description: { type: 'string', nullable: true, example: 'Conexión con concesionarios viales' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ProjectSummary: {
        allOf: [
          { $ref: '#/components/schemas/Project' },
          {
            type: 'object',
            required: ['taskCount', 'doneCount', 'progress'],
            properties: {
              taskCount: { type: 'integer', example: 4 },
              doneCount: { type: 'integer', example: 1 },
              progress: { type: 'integer', minimum: 0, maximum: 100, example: 25 },
            },
          },
        ],
      },
      CreateProjectInput: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120, example: 'App de parqueaderos' },
          description: { type: 'string', maxLength: 2000, nullable: true, example: 'Flujo de pago' },
        },
      },
      PatchProjectInput: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120, example: 'Nuevo nombre' },
          description: { type: 'string', maxLength: 2000, nullable: true, example: null },
        },
      },
      Stats: {
        type: 'object',
        required: ['projects', 'tasks', 'done', 'progress', 'byStatus', 'byPriority'],
        properties: {
          projects: { type: 'integer', example: 4 },
          tasks: { type: 'integer', example: 11 },
          done: { type: 'integer', example: 4 },
          progress: { type: 'integer', example: 36 },
          byStatus: {
            type: 'object',
            additionalProperties: { type: 'integer' },
            example: { TODO: 4, IN_PROGRESS: 3, DONE: 4 },
          },
          byPriority: {
            type: 'object',
            additionalProperties: { type: 'integer' },
            example: { LOW: 3, MEDIUM: 4, HIGH: 4 },
          },
        },
      },
      ProblemDetails: {
        type: 'object',
        required: ['type', 'title', 'status', 'code', 'instance', 'requestId'],
        properties: {
          type: { type: 'string', format: 'uri', example: 'https://gopass-task-manager.local/errors/project-has-tasks' },
          title: { type: 'string', example: 'El proyecto tiene tareas asociadas' },
          status: { type: 'integer', example: 409 },
          code: { type: 'string', example: 'PROJECT_HAS_TASKS' },
          detail: { type: 'string', example: 'No se puede eliminar un proyecto que todavía tiene tareas. Elimínalas primero.' },
          instance: { type: 'string', example: '/api/projects/5b1f0a10-0000-4000-8000-000000000001' },
          requestId: { type: 'string', format: 'uuid', example: '8f7a94dc-8c46-4e5a-93f1-d00735dbdf55' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              required: ['path', 'message'],
              properties: {
                path: { type: 'string', example: 'name' },
                message: { type: 'string', example: 'El nombre no puede estar vacío.' },
              },
            },
          },
        },
      },
    },
  },
};

export function setupSwagger(app: Express): void {
  app.get('/api/docs.json', (_req, res) => {
    res.json(openApiSpec);
  });
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: 'GoPass Task Manager - API Docs',
    }),
  );
}
