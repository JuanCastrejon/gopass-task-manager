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
    { name: 'Tasks', description: 'Operaciones CRUD de tareas, estados y filtros' },
    { name: 'Stats', description: 'Métricas analíticas del panel' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Verificar salud del sistema y persistencia (RF-15)',
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
          400: {
            description: 'Identificador con formato inválido',
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
        summary: 'Eliminar proyecto sin tareas (RF-05)',
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
          400: {
            description: 'Identificador con formato inválido',
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
    '/projects/{projectId}/tasks': {
      get: {
        tags: ['Tasks'],
        summary: 'Listar tareas de un proyecto con filtros (RF-11, RF-13)',
        parameters: [
          {
            name: 'projectId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'status',
            in: 'query',
            description: 'Filtrar por estado (repetible)',
            schema: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'] },
          },
          {
            name: 'priority',
            in: 'query',
            description: 'Filtrar por prioridad (repetible)',
            schema: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          },
          {
            name: 'q',
            in: 'query',
            description: 'Búsqueda por texto en título',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Listado de tareas coincidentes',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Task' },
                },
              },
            },
          },
          400: {
            description: 'Identificador o filtro con valor inválido',
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
        },
      },
      post: {
        tags: ['Tasks'],
        summary: 'Crear tarea en un proyecto (RF-06)',
        parameters: [
          {
            name: 'projectId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateTaskInput' },
            },
          },
        },
        responses: {
          201: {
            description: 'Tarea creada exitosamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Task' },
              },
            },
          },
          409: {
            description:
              'El proyecto tiene un limite de trabajo en curso y esta lleno (WIP_LIMIT_REACHED)',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
          400: {
            description: 'Payload inválido o campo completedAt no permitido',
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
        },
      },
    },
    '/tasks/{id}': {
      get: {
        tags: ['Tasks'],
        summary: 'Obtener detalle de una tarea por ID',
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
            description: 'Detalle de la tarea',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Task' },
              },
            },
          },
          400: {
            description: 'Identificador con formato inválido',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
          404: {
            description: 'Tarea no encontrada',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
        },
      },
      patch: {
        tags: ['Tasks'],
        summary: 'Actualizar tarea: estado, prioridad, título o proyecto (RF-09, RF-10)',
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
              schema: { $ref: '#/components/schemas/PatchTaskInput' },
            },
          },
        },
        responses: {
          200: {
            description: 'Tarea actualizada (con completedAt sellado si transicionó a DONE)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Task' },
              },
            },
          },
          409: {
            description:
              'El proyecto tiene un limite de trabajo en curso y esta lleno (WIP_LIMIT_REACHED)',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
          400: {
            description: 'Payload inválido o campo completedAt no permitido',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
          404: {
            description: 'Tarea no encontrada o proyecto destino inexistente',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
        },
      },
      delete: {
        tags: ['Tasks'],
        summary: 'Eliminar una tarea por ID (RF-10)',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          204: { description: 'Tarea eliminada exitosamente' },
          400: {
            description: 'Identificador con formato inválido',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
          404: {
            description: 'Tarea no encontrada',
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
        summary: 'Obtener métricas globales del sistema (RF-12)',
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
          wipLimit: {
            type: 'integer',
            nullable: true,
            minimum: 1,
            maximum: 100,
            description:
              'Maximo de tareas simultaneas en IN_PROGRESS. null = sin limite. Superarlo devuelve 409 WIP_LIMIT_REACHED.',
            example: 3,
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ProjectSummary: {
        allOf: [
          { $ref: '#/components/schemas/Project' },
          {
            type: 'object',
            required: ['taskCount', 'doneCount', 'inProgressCount', 'byPriority', 'progress'],
            properties: {
              taskCount: { type: 'integer', example: 4 },
              doneCount: { type: 'integer', example: 1 },
              inProgressCount: {
                type: 'integer',
                description: 'Tareas ahora mismo en IN_PROGRESS. Es el numerador de wipLimit.',
                example: 1,
              },
              byPriority: {
                type: 'object',
                description:
                  'Cuántas tareas de cada prioridad tiene el proyecto. Las tres claves llegan siempre, también en 0.',
                required: ['LOW', 'MEDIUM', 'HIGH'],
                properties: {
                  LOW: { type: 'integer', example: 1 },
                  MEDIUM: { type: 'integer', example: 1 },
                  HIGH: { type: 'integer', example: 2 },
                },
              },
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
          wipLimit: { type: 'integer', nullable: true, minimum: 1, maximum: 100, example: 3 },
        },
      },
      PatchProjectInput: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120, example: 'Nuevo nombre' },
          description: { type: 'string', maxLength: 2000, nullable: true, example: null },
          // `null` explicito retira el limite; ausente lo deja como estaba.
          wipLimit: { type: 'integer', nullable: true, minimum: 1, maximum: 100, example: 3 },
        },
      },
      Task: {
        type: 'object',
        required: ['id', 'projectId', 'title', 'status', 'priority', 'completedAt', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          projectId: { type: 'string', format: 'uuid' },
          title: { type: 'string', example: 'Definir contrato de conciliación' },
          description: { type: 'string', nullable: true, example: 'Especificación del protocolo' },
          status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'], example: 'IN_PROGRESS' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], example: 'HIGH' },
          completedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateTaskInput: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200, example: 'Nueva tarea operativa' },
          description: { type: 'string', maxLength: 5000, nullable: true, example: 'Detalle de la tarea' },
          status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'], default: 'TODO' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
        },
      },
      PatchTaskInput: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: 'string', maxLength: 5000, nullable: true },
          status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'] },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          projectId: { type: 'string', format: 'uuid', description: 'Reasignar a otro proyecto' },
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
          type: { type: 'string', format: 'uri', example: 'https://gopass-task-manager.local/errors/task-not-found' },
          title: { type: 'string', example: 'Tarea no encontrada' },
          status: { type: 'integer', example: 404 },
          code: { type: 'string', example: 'TASK_NOT_FOUND' },
          detail: { type: 'string', example: 'No existe una tarea con id ...' },
          instance: { type: 'string', example: '/api/tasks/7c2e1b20-0000-4000-8000-000000000001' },
          requestId: { type: 'string', format: 'uuid', example: '8f7a94dc-8c46-4e5a-93f1-d00735dbdf55' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              required: ['path', 'message'],
              properties: {
                path: { type: 'string', example: 'title' },
                message: { type: 'string', example: 'El título no puede estar vacío.' },
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
