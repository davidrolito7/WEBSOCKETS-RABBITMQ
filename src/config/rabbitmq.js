const amqp = require('amqplib');
const { rabbit } = require('./env');

const EXCHANGE = 'sijudi.notificaciones';
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000;

let connection = null;
let channel = null;
let connectingPromise = null;
let closing = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectRabbit() {
  if (channel) return channel;
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      try {
        const delay = INITIAL_RECONNECT_DELAY * 2 ** (attempt - 1);

        if (attempt > 1) {
          console.log(`[RabbitMQ] Reintentando conexión en ${delay}ms...`);
          await sleep(delay);
        }

        connection = await amqp.connect(rabbit);
        channel = await connection.createConfirmChannel();

        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

        connection.on('error', (err) => {
          console.error('[RabbitMQ] Error en conexión:', err.message);
        });

        connection.on('close', () => {
          console.warn('[RabbitMQ] Conexión cerrada');
          connection = null;
          channel = null;
        });

        channel.on('error', (err) => {
          console.error('[RabbitMQ] Error en canal:', err.message);
        });

        channel.on('close', () => {
          console.warn('[RabbitMQ] Canal cerrado');
          channel = null;
        });

        console.log('[RabbitMQ] Conectado correctamente');
        return channel;
      } catch (err) {
        console.error(`[RabbitMQ] Falló intento ${attempt}:`, err.message);

        connection = null;
        channel = null;

        if (attempt === MAX_RECONNECT_ATTEMPTS) {
          throw err;
        }
      }
    }
  })();

  try {
    return await connectingPromise;
  } finally {
    connectingPromise = null;
  }
}

async function getRabbitChannel() {
  return connectRabbit();
}

async function publishNotification(routingKey, payload) {
  const ch = await getRabbitChannel();

  return new Promise((resolve, reject) => {
    ch.publish(
      EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      {
        persistent: true,
        contentType: 'application/json',
      },
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

async function closeConnection() {
  if (closing) return;
  closing = true;

  try {
    if (channel) await channel.close();
    if (connection) await connection.close();

    channel = null;
    connection = null;

    console.log('[RabbitMQ] Conexión cerrada correctamente');
  } catch (err) {
    console.error('[RabbitMQ] Error cerrando conexión:', err.message);
  }
}

process.once('SIGTERM', closeConnection);
process.once('SIGINT', closeConnection);

module.exports = {
  getRabbitChannel,
  publishNotification,
  closeConnection,
  EXCHANGE,
};