const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');
const env = require('./src/config/env');
const { getRabbitChannel, EXCHANGE } = require('./src/config/rabbitmq');
const { getUserContextFromToken } = require('./src/middlewares/authJwt');
const { corsOptions } = require('./src/config/cors');

const server = http.createServer(app);

const io = new Server(server, {
    cors: corsOptions
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;

        if (!token) {
            return next(new Error('Authentication error'));
        }

        socket.userContext = await getUserContextFromToken(token);
        next();
    } catch (err) {
        console.error('[Auth] Socket no autenticado:', err.message);
        next(new Error('Authentication error'));
    }
});

io.on('connection', socket => {
    const { idArea, idSistemaPerfil, idSubArea } = socket.userContext;

    const salaContexto =
        `ctx.area.${idArea}.perfil.${idSistemaPerfil}.subarea.${idSubArea}`;

    socket.join(salaContexto);

    console.log(`[Socket] ✓ Conectado a ${salaContexto}`);

    socket.on('disconnect', () => {
        console.log(`[Socket] ✗ Desconectado de ${salaContexto}`);
    });
});

// ── RabbitMQ Consumer ─────────────────────────────────────────────────────────
async function startConsumer() {
    const channel = await getRabbitChannel();

    await channel.prefetch(20);

    await channel.assertQueue('sijudi.notif.consumer.dlq', {
        durable: true
    });

    const { queue } = await channel.assertQueue('sijudi.notif.consumer', {
        durable: true,
        deadLetterExchange: '',
        deadLetterRoutingKey: 'sijudi.notif.consumer.dlq'
    });

    await channel.bindQueue(queue, EXCHANGE, 'area.#');

    await channel.consume(
        queue,
        msg => {
            if (!msg) return;

            try {
                const payload = JSON.parse(msg.content.toString());

                const idAreaDestino = Number(payload.idAreaDestino);
                const idSistemaPerfilDestino = Number(payload.idSistemaPerfilDestino);
                const idSubAreaDestino = Number(payload.idSubAreaDestino);

                if (
                    !Number.isInteger(idAreaDestino) ||
                    !Number.isInteger(idSistemaPerfilDestino) ||
                    !Number.isInteger(idSubAreaDestino)
                ) {
                    throw new Error('Payload de notificación inválido');
                }

                console.log(
                    `[RabbitMQ] ✓ Notificación #${payload.notificacion_id} → ` +
                    `Área ${idAreaDestino} | Perfil ${idSistemaPerfilDestino} | SubÁrea ${idSubAreaDestino}`
                );

                const salaDestino =
                    `ctx.area.${idAreaDestino}` +
                    `.perfil.${idSistemaPerfilDestino}` +
                    `.subarea.${idSubAreaDestino}`;

                io.to(salaDestino).emit('notificacion', payload);

                channel.ack(msg);
            } catch (err) {
                console.error('[RabbitMQ] Error procesando mensaje:', err.message);

                // No reencolar mensajes inválidos; enviarlos a DLQ si existe.
                channel.nack(msg, false, false);
            }
        },
        {
            noAck: false
        }
    );

    console.log('[RabbitMQ] ✓ Consumer activo esperando notificaciones');
}

// ── Inicio ────────────────────────────────────────────────────────────────────
startConsumer().catch(err => {
    console.error('[Error] No se pudo iniciar el consumer:', err.message);
});

server.listen(env.port, () => {
    console.log(`[Servidor] ✓ Iniciado en http://localhost:${env.port}`);
});