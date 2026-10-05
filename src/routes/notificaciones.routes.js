const { Router } = require('express');
const svc = require('../services/notificaciones.service');
const { authJwt } = require('../middlewares/authJwt');

const router = Router();

/**
 * @swagger
 * /api/notificaciones:
 *   post:
 *     summary: Crear una nueva notificación
 *     description: Registra una nueva notificación judicial y la envía por RabbitMQ a los destinatarios especificados. Requiere autenticación JWT.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NotificacionInput'
 *     responses:
 *       201:
 *         description: Notificación creada exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponsePost'
 *       400:
 *         description: Petición inválida (faltan campos obligatorios).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError400'
 *       401:
 *         description: No autorizado (token JWT ausente o inválido).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError401'
 *       500:
 *         description: Error interno del servidor al procesar la solicitud.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError500'
 */
router.post('/', authJwt, async (req, res) => {
    // Origen desde el token
    const ctxOrigen = req.user;
    
    // Destino y payload desde el body
    const required = ['idTramite', 'idCatTipoTramite', 'folio', 'idAreaDestino', 'idSubAreaDestino', 'idSistemaPerfilDestino', 'mensaje'];
    const missing  = required.filter(k => req.body[k] == null);
    if (missing.length) {
        return res.status(400).json({
            success: false,
            status: 400,
            mensaje: 'Petición inválida',
            data: null,
            error: `Faltan campos obligatorios: ${missing.join(', ')}`
        });
    }
    
    try {
        const bodyWithContext = {
            ...req.body,
            idAreaOrigen: ctxOrigen.idArea,
            idSubAreaOrigen: ctxOrigen.idSubArea,
            idSistemaPerfilOrigen: ctxOrigen.idSistemaPerfil
        };
        const result = await svc.crearNotificacion(bodyWithContext);
        res.status(201).json({
            success: true,
            status: 201,
            mensaje: 'Notificación creada exitosamente',
            data: result
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            status: 500,
            mensaje: 'Error interno del servidor al crear la notificación',
            data: null,
            error: err.message
        });
    }
});

/**
 * @swagger
 * /api/notificaciones:
 *   get:
 *     summary: Obtener notificaciones del usuario autenticado
 *     description: Retorna la lista de notificaciones no leídas correspondientes al contexto funcional del usuario (idArea, idSubArea, idSistemaPerfil) extraído del token JWT.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Listado de notificaciones obtenido exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseGet'
 *       401:
 *         description: No autorizado (token JWT ausente o inválido).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError401'
 *       500:
 *         description: Error interno del servidor al obtener las notificaciones.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError500'
 */
router.get('/', authJwt, async (req, res) => {
    try {
        const result = await svc.leerNotificacionesPorContexto(req.user);
        res.json({
            success: true,
            status: 200,
            mensaje: 'Notificaciones obtenidas exitosamente',
            data: result
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            status: 500,
            mensaje: 'Error interno del servidor al obtener las notificaciones',
            data: null,
            error: err.message
        });
    }
});

/**
 * @swagger
 * /api/notificaciones/{id}:
 *   put:
 *     summary: Marcar una notificación como leída
 *     description: Actualiza el estado de la notificación a leída para el contexto del usuario autenticado.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la notificación a marcar como leída.
 *     responses:
 *       200:
 *         description: Notificación marcada como leída exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponsePut'
 *       401:
 *         description: No autorizado (token JWT ausente o inválido).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError401'
 *       404:
 *         description: Notificación no encontrada (el recurso no existe o no corresponde a tu contexto).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError404'
 *       500:
 *         description: Error interno del servidor al marcar la notificación como leída.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError500'
 */
router.put('/:id', authJwt, async (req, res) => {
    try {
        const updated = await svc.marcarLeidaPorContexto(Number(req.params.id), req.user);
        if (!updated) {
            return res.status(404).json({
                success: false,
                status: 404,
                mensaje: 'Notificación no encontrada',
                data: null,
                error: 'El recurso solicitado no existe'
            });
        }
        res.json({
            success: true,
            status: 200,
            mensaje: 'Notificación marcada como leída exitosamente',
            data: { ok: true }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            status: 500,
            mensaje: 'Error interno del servidor al marcar la notificación como leída',
            data: null,
            error: err.message
        });
    }
});

module.exports = router;
