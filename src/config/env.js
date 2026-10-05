require('dotenv').config();

module.exports = {
    port: process.env.PORT,
    db: {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT),
        options: {
            trustServerCertificate: true,
            encrypt: false,
        },
        pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
    },
    rabbit: {
        protocol: 'amqp',
        hostname: process.env.RABBIT_HOST,
        port: Number(process.env.RABBIT_PORT),
        username: process.env.RABBIT_USER,
        password: process.env.RABBIT_PASS,
        vhost: process.env.RABBIT_VHOST,
        authMechanism: ['PLAIN', 'AMQPLAIN', 'EXTERNAL']
    },
    jwt: {
        authority: process.env.JWT_AUTHORITY,
        audience: process.env.JWT_AUDIENCE
    }
};
