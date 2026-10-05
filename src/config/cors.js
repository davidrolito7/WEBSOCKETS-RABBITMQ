// Orígenes permitidos (http y https). El origen es solo esquema + host + puerto,
// por eso https://aplicacionespruebas.tribunaloaxaca.gob.mx/sijudi/login llega
// como https://aplicacionespruebas.tribunaloaxaca.gob.mx
const ORIGENES_PERMITIDOS = [
    /^https?:\/\/([a-z0-9-]+\.)*tribunaloaxaca\.gob\.mx(:\d+)?$/i,
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i
];

// Orígenes extra separados por coma, ej. CORS_ORIGINS=http://10.1.10.20:4200
const origenesExtra = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(o => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

function origenPermitido(origin) {
    return origenesExtra.includes(origin) ||
        ORIGENES_PERMITIDOS.some(regex => regex.test(origin));
}

const corsOptions = {
    origin(origin, callback) {
        // Peticiones sin Origin (Postman, curl, servidor a servidor)
        const permitido = !origin || origenPermitido(origin);
        if (!permitido) console.warn(`[CORS] Origen no permitido: ${origin}`);
        callback(null, permitido);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

module.exports = { corsOptions };
