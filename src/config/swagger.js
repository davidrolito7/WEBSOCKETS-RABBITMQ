const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const env = require('./env');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'SIJUDI - API de Notificaciones',
            version: '1.0.0',
            description: 'API para la gestión, almacenamiento y distribución de notificaciones judiciales en tiempo real, integrando Express, SQL Server y RabbitMQ.',
            contact: {
                name: 'Equipo de Desarrollo SIJUDI',
            },
        },
        servers: [
            {
                url: "https://pruebas.tribunaloaxaca.gob.mx/rabbitmq",
                description: "Servidor de Pruebas",
            },
            {
                url: `http://localhost:${env.port || 3000}`,
                description: "Servidor Local de Desarrollo",
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Introduce tu token JWT (sin la palabra "Bearer").',
                },
            },
            schemas: {
                NotificacionInput: {
                    type: 'object',
                    required: [
                        'idTramite',
                        'idCatTipoTramite',
                        'folio',
                        'idAreaDestino',
                        'idSubAreaDestino',
                        'idSistemaPerfilDestino',
                        'mensaje'
                    ],
                    properties: {
                        idTramite: {
                            type: 'integer',
                            description: 'ID único del trámite judicial relacionado.',
                            example: 1045
                        },
                        idCatTipoTramite: {
                            type: 'integer',
                            description: 'ID del tipo de trámite.',
                            example: 1
                        },
                        folio: {
                            type: 'string',
                            description: 'Folio o expediente del trámite.',
                            example: '0001/2026'
                        },
                        idAreaDestino: {
                            type: 'integer',
                            description: 'ID de la Dirección / Área de destino.',
                            example: 5
                        },
                        idSubAreaDestino: {
                            type: 'integer',
                            description: 'ID de la Subárea o Juzgado específico de destino.',
                            example: 12
                        },
                        idSistemaPerfilDestino: {
                            type: 'integer',
                            description: 'ID del perfil de usuario de destino (ej. Secretario, Juez).',
                            example: 7181
                        },
                        mensaje: {
                            type: 'string',
                            description: 'Mensaje o cuerpo de la notificación.',
                            example: 'Se ha recibido un nuevo trámite para su revisión en la bandeja.'
                        }
                    }
                },
                NotificacionItem: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 582 },
                        idTramite: { type: 'integer', example: 1045 },
                        idCatTipoTramite: { type: 'integer', example: 1 },
                        folio: { type: 'string', example: '0001/2026' },
                        tipoTramite: {
                            type: 'object',
                            properties: {
                                idCatTipoTramite: { type: 'integer', example: 1 },
                                descripcion: { type: 'string', nullable: true, example: 'Demanda inicial' },
                                route: { type: 'string', nullable: true, example: '/tramites/demanda-inicial' }
                            }
                        },
                        idAreaOrigen: { type: 'integer', example: 1 },
                        idSubAreaOrigen: { type: 'integer', example: 2 },
                        idSistemaPerfilOrigen: { type: 'integer', example: 3 },
                        mensaje: { type: 'string', example: 'Se ha recibido un nuevo trámite para su revisión.' },
                        leida: { type: 'boolean', example: false },
                        fecha_creacion: { type: 'string', format: 'date-time', example: '2026-05-19T10:33:31.000Z' }
                    }
                },
                ApiResponsePost: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                        status: { type: 'integer', example: 201 },
                        mensaje: { type: 'string', example: 'Notificación creada exitosamente' },
                        data: {
                            type: 'object',
                            properties: {
                                notificacion_id: { type: 'integer', example: 582 }
                            }
                        },
                        error: { type: 'string', nullable: true, example: null }
                    }
                },
                ApiResponseGet: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                        status: { type: 'integer', example: 200 },
                        mensaje: { type: 'string', example: 'Notificaciones obtenidas exitosamente' },
                        data: {
                            type: 'object',
                            properties: {
                                soloConteo: { type: 'boolean', example: false },
                                pendientes: { type: 'integer', example: 3 },
                                notificaciones: {
                                    type: 'array',
                                    items: {
                                        $ref: '#/components/schemas/NotificacionItem'
                                    }
                                }
                            }
                        },
                        error: { type: 'string', nullable: true, example: null }
                    }
                },
                ApiResponsePut: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                        status: { type: 'integer', example: 200 },
                        mensaje: { type: 'string', example: 'Notificación marcada como leída exitosamente' },
                        data: {
                            type: 'object',
                            properties: {
                                ok: { type: 'boolean', example: true }
                            }
                        },
                        error: { type: 'string', nullable: true, example: null }
                    }
                },
                ApiResponseError400: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        status: { type: 'integer', example: 400 },
                        mensaje: { type: 'string', example: 'Petición inválida' },
                        data: { type: 'object', nullable: true, example: null },
                        error: { type: 'string', example: 'Faltan campos obligatorios: tramite_id, folio' }
                    }
                },
                ApiResponseError401: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        status: { type: 'integer', example: 401 },
                        mensaje: { type: 'string', example: 'Autenticación fallida' },
                        data: { type: 'object', nullable: true, example: null },
                        error: { type: 'string', example: 'Token expirado' }
                    }
                },
                ApiResponseError404: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        status: { type: 'integer', example: 404 },
                        mensaje: { type: 'string', example: 'Notificación no encontrada' },
                        data: { type: 'object', nullable: true, example: null },
                        error: { type: 'string', example: 'El recurso solicitado no existe' }
                    }
                },
                ApiResponseError500: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        status: { type: 'integer', example: 500 },
                        mensaje: { type: 'string', example: 'Error interno del servidor al procesar la solicitud' },
                        data: { type: 'object', nullable: true, example: null },
                        error: { type: 'string', example: 'Servidor no disponible' }
                    }
                }
            }
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    },
    apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);

function setupSwagger(app) {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    console.log(`[Swagger] Documentación Swagger UI disponible en http://localhost:${env.port || 3000}/api-docs`);
}

module.exports = { setupSwagger };
