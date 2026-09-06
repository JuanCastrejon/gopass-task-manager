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
    { name: 'Columns', description: 'Columnas del tablero, limites de trabajo en curso y orden' },
    { name: 'Tasks', description: 'Operaciones CRUD de tareas, estados y filtros' },
    { name: 'Labels', description: 'Etiquetas de color por proyecto y asignación a tareas' },
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
    '/projects/{projectId}/columns': {
      get: {
        tags: ['Columns'],
        summary: 'Listar las columnas del tablero con su recuento de tareas',
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description: 'Columnas ordenadas por posicion',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/ProjectColumnSummary' } },
              },
            },
          },
          404: {
            description: 'Proyecto no encontrado',
            content: {
              'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } },
            },
          },
        },
      },
      post: {
        tags: ['Columns'],
        summary: 'Anadir una columna al final del tablero',
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateColumnInput' } } },
        },
        responses: {
          201: {
            description: 'Columna creada',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectColumn' } } },
          },
          400: {
            description: 'Payload invalido, o limite en una columna de categoria DONE',
            content: {
              'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } },
            },
          },
          409: {
            description: 'Ya existe una columna con ese nombre en el proyecto (COLUMN_NAME_TAKEN)',
            content: {
              'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } },
            },
          },
        },
      },
    },
    '/projects/{projectId}/columns/reorder': {
      patch: {
        tags: ['Columns'],
        summary: 'Reordenar el tablero enviando el orden completo',
        description:
          'Se envia la lista entera y no un desplazamiento: un intercambio en dos sentencias dejaria un instante con dos columnas en la misma posicion.',
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['columnIds'],
                properties: {
                  columnIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Columnas ya reordenadas',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/ProjectColumnSummary' } },
              },
            },
          },
          404: {
            description: 'Orden incompleto o con columnas ajenas al proyecto',
            content: {
              'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } },
            },
          },
        },
      },
    },
    '/projects/{projectId}/columns/{columnId}': {
      patch: {
        tags: ['Columns'],
        summary: 'Renombrar, limitar u ordenar una columna',
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'columnId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/PatchColumnInput' } } },
        },
        responses: {
          200: {
            description: 'Columna actualizada',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectColumn' } } },
          },
          400: {
            description: 'Payload invalido, o intento de cambiar la categoria',
            content: {
              'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } },
            },
          },
          404: {
            description: 'La columna no existe o pertenece a otro proyecto (COLUMN_NOT_FOUND)',
            content: {
              'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } },
            },
          },
        },
      },
      delete: {
        tags: ['Columns'],
        summary: 'Eliminar una columna, opcionalmente reasignando sus tareas',
        description:
          'Sin reassignTo, una columna con tareas devuelve 409 con el recuento: no hay cascada sobre trabajo ajeno. Con reassignTo, mover y borrar ocurren en la misma transaccion y se respeta el limite del destino.',
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'columnId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          {
            name: 'reassignTo',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
            description: 'Columna del mismo proyecto a la que se mueven las tareas antes de borrar.',
          },
        ],
        responses: {
          204: { description: 'Columna eliminada' },
          404: {
            description: 'La columna no existe o pertenece a otro proyecto',
            content: {
              'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } },
            },
          },
          409: {
            description:
              'Tiene tareas y no se indico destino (COLUMN_HAS_TASKS), es la ultima de su categoria (LAST_COLUMN_OF_CATEGORY), o el destino no tiene cupo (WIP_LIMIT_REACHED)',
            content: {
              'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } },
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
          {
            name: 'labels',
            in: 'query',
            description: 'Filtrar por una o varias etiquetas (repetible o separadas por coma, semántica alguna)',
            schema: { type: 'string', format: 'uuid' },
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
    '/tasks/{id}/reorder': {
      patch: {
        tags: ['Tasks'],
        summary: 'Reordenar tarea entre dos vecinas o al inicio/fin de columna',
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
              schema: { $ref: '#/components/schemas/ReorderTaskInput' },
            },
          },
        },
        responses: {
          200: {
            description: 'Tarea reordenada exitosamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Task' },
              },
            },
          },
          400: {
            description: 'Payload inválido o identificadores de tareas inconsistentes',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
          404: {
            description: 'Tarea, columna destino o tarea vecina inexistente',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
          409: {
            description: 'La columna destino tiene un límite de trabajo en curso lleno (WIP_LIMIT_REACHED)',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
        },
      },
    },
    '/projects/{projectId}/labels': {
      get: {
        tags: ['Labels'],
        summary: 'Listar etiquetas del proyecto (SL-18)',
        parameters: [
          {
            name: 'projectId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          200: {
            description: 'Listado de etiquetas del proyecto',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Label' },
                },
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
        tags: ['Labels'],
        summary: 'Crear etiqueta en el proyecto (SL-18)',
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
              schema: { $ref: '#/components/schemas/CreateLabelInput' },
            },
          },
        },
        responses: {
          201: {
            description: 'Etiqueta creada exitosamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Label' },
              },
            },
          },
          400: {
            description: 'Error de validación (nombre vacío o color fuera de paleta)',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
          409: {
            description: 'Nombre de etiqueta en uso dentro del proyecto',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
        },
      },
    },
    '/labels/{id}': {
      patch: {
        tags: ['Labels'],
        summary: 'Actualizar etiqueta (SL-18)',
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
              schema: { $ref: '#/components/schemas/PatchLabelInput' },
            },
          },
        },
        responses: {
          200: {
            description: 'Etiqueta actualizada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Label' },
              },
            },
          },
          400: {
            description: 'Error de validación',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
          404: {
            description: 'Etiqueta no encontrada',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
          409: {
            description: 'Nombre de etiqueta en uso dentro del proyecto',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
        },
      },
      delete: {
        tags: ['Labels'],
        summary: 'Eliminar etiqueta (SL-18)',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'confirm',
            in: 'query',
            required: false,
            schema: { type: 'boolean' },
            description: 'Si es true, confirma la desasignación de tareas y eliminación.',
          },
        ],
        responses: {
          204: {
            description: 'Etiqueta eliminada',
          },
          404: {
            description: 'Etiqueta no encontrada',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
          409: {
            description: 'La etiqueta tiene tareas asociadas y no se envió confirm=true',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
        },
      },
    },
    '/tasks/{id}/labels': {
      put: {
        tags: ['Labels'],
        summary: 'Reemplazar conjunto completo de etiquetas de una tarea (SL-18)',
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
              schema: { $ref: '#/components/schemas/SetTaskLabelsInput' },
            },
          },
        },
        responses: {
          200: {
            description: 'Tarea actualizada con las etiquetas asignadas',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Task' },
              },
            },
          },
          400: {
            description: 'Etiqueta inexistente o perteneciente a otro proyecto',
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
        required: ['id', 'name', 'background', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Telepeaje — integración de operadores' },
          description: { type: 'string', nullable: true, example: 'Conexión con concesionarios viales' },
          background: {
            type: 'string',
            enum: ['neutro', 'azul', 'verde', 'ambar', 'purpura', 'rosa'],
            example: 'neutro',
            description: 'Fondo visual del tablero elegido de la paleta cerrada de seis fondos semánticos.',
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
            required: ['taskCount', 'doneCount', 'byPriority', 'progress'],
            properties: {
              taskCount: { type: 'integer', example: 4 },
              doneCount: { type: 'integer', example: 1 },
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
      ProjectColumn: {
        type: 'object',
        required: ['id', 'projectId', 'name', 'category', 'position', 'wipLimit', 'sort'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          projectId: { type: 'string', format: 'uuid' },
          name: { type: 'string', maxLength: 60, example: 'En revision' },
          category: {
            type: 'string',
            enum: ['TODO', 'IN_PROGRESS', 'DONE'],
            description:
              'Categoria de ciclo de vida. Varias columnas pueden compartirla. De ella dependen el sellado de completedAt y la agregacion global de /stats.',
          },
          position: { type: 'integer', minimum: 1, example: 2 },
          wipLimit: {
            type: 'integer',
            nullable: true,
            minimum: 1,
            maximum: 100,
            description:
              'Maximo de tareas simultaneas en esta columna. null = sin limite. Nunca en una columna de categoria DONE.',
            example: 3,
          },
          sort: {
            type: 'string',
            enum: ['priority_desc', 'priority_asc', 'created_desc', 'created_asc', 'manual', 'due_asc'],
            description: 'Criterio de orden de las tareas dentro de la columna. Compartido por el equipo.',
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ProjectColumnSummary: {
        allOf: [
          { $ref: '#/components/schemas/ProjectColumn' },
          {
            type: 'object',
            required: ['taskCount'],
            properties: { taskCount: { type: 'integer', example: 4 } },
          },
        ],
      },
      CreateColumnInput: {
        type: 'object',
        required: ['name', 'category'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 60, example: 'En revision' },
          category: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'] },
          wipLimit: { type: 'integer', nullable: true, minimum: 1, maximum: 100 },
          sort: {
            type: 'string',
            enum: ['priority_desc', 'priority_asc', 'created_desc', 'created_asc', 'manual', 'due_asc'],
          },
        },
      },
      PatchColumnInput: {
        type: 'object',
        description: 'La categoria no es modificable: cambiarla moveria el estado de todas sus tareas.',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 60 },
          wipLimit: { type: 'integer', nullable: true, minimum: 1, maximum: 100 },
          sort: {
            type: 'string',
            enum: ['priority_desc', 'priority_asc', 'created_desc', 'created_asc', 'manual', 'due_asc'],
          },
        },
      },
      CreateProjectInput: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120, example: 'App de parqueaderos' },
          description: { type: 'string', maxLength: 2000, nullable: true, example: 'Flujo de pago' },
          background: {
            type: 'string',
            enum: ['neutro', 'azul', 'verde', 'ambar', 'purpura', 'rosa'],
            default: 'neutro',
            example: 'azul',
            description: 'Fondo visual del tablero. Si se omite, nace como neutro.',
          },
        },
      },
      PatchProjectInput: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120, example: 'Nuevo nombre' },
          description: { type: 'string', maxLength: 2000, nullable: true, example: null },
          background: {
            type: 'string',
            enum: ['neutro', 'azul', 'verde', 'ambar', 'purpura', 'rosa'],
            example: 'verde',
            description: 'Nuevo fondo visual del tablero.',
          },
        },
      },
      Task: {
        type: 'object',
        required: ['id', 'projectId', 'title', 'status', 'priority', 'position', 'dueDate', 'completedAt', 'createdAt', 'updatedAt', 'labels'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          projectId: { type: 'string', format: 'uuid' },
          columnId: {
            type: 'string',
            format: 'uuid',
            description: 'Columna del tablero en la que vive. Su categoria es siempre `status`.',
          },
          title: { type: 'string', example: 'Definir contrato de conciliación' },
          description: { type: 'string', nullable: true, example: 'Especificación del protocolo' },
          status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'], example: 'IN_PROGRESS' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], example: 'HIGH' },
          position: {
            type: 'number',
            format: 'double',
            description: 'Posición fraccionaria de ordenación manual dentro de la columna.',
            example: 1024.0,
          },
          dueDate: {
            type: 'string',
            format: 'date',
            nullable: true,
            example: '2026-03-12',
            description: 'Fecha de vencimiento en formato YYYY-MM-DD (sin componente horario).',
          },
          completedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          labels: {
            type: 'array',
            items: { $ref: '#/components/schemas/Label' },
          },
        },
      },
      Label: {
        type: 'object',
        required: ['id', 'projectId', 'name', 'color', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          projectId: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Backend' },
          color: {
            type: 'string',
            enum: ['slate', 'red', 'orange', 'amber', 'yellow', 'green', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink'],
            example: 'blue',
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateLabelInput: {
        type: 'object',
        required: ['name', 'color'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50, example: 'Backend' },
          color: {
            type: 'string',
            enum: ['slate', 'red', 'orange', 'amber', 'yellow', 'green', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink'],
            example: 'blue',
          },
        },
      },
      PatchLabelInput: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50, example: 'Core Backend' },
          color: {
            type: 'string',
            enum: ['slate', 'red', 'orange', 'amber', 'yellow', 'green', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink'],
            example: 'teal',
          },
        },
      },
      SetTaskLabelsInput: {
        type: 'object',
        required: ['labelIds'],
        properties: {
          labelIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            example: ['9a3b0001-0000-4000-8000-000000000001'],
          },
        },
      },
      ReorderTaskInput: {
        type: 'object',
        required: ['columnId', 'previousTaskId', 'nextTaskId'],
        description: 'Parámetros para reordenar una tarea. Si ambas vecinas son null, la tarea se sitúa al final de la columna (MAX + 1024, o 1024 si está vacía).',
        properties: {
          columnId: { type: 'string', format: 'uuid', description: 'Columna destino donde se ubicará la tarea.' },
          previousTaskId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Identificador de la tarea inmediatamente anterior, o null si va al inicio (o si ambas son null, al final).',
          },
          nextTaskId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Identificador de la tarea inmediatamente siguiente, o null si va al final.',
          },
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
          dueDate: { type: 'string', format: 'date', nullable: true, example: '2026-03-12' },
        },
      },
      PatchTaskInput: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: 'string', maxLength: 5000, nullable: true },
          status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'] },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          dueDate: { type: 'string', format: 'date', nullable: true, example: '2026-03-12' },
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
      customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css',
      customJs: [
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.js',
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.js',
      ],
    }),
  );
}
