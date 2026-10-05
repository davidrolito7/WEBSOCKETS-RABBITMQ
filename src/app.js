const express = require('express');
const cors = require('cors');
const path = require('path');
const notificacionesRouter = require('./routes/notificaciones.routes');
const { setupSwagger } = require('./config/swagger');
const { corsOptions } = require('./config/cors');

const app = express();

// Middlewares globales
app.use(cors(corsOptions)); // también responde los preflight OPTIONS
app.use(express.json());

// Swagger API Docs
setupSwagger(app);

// Redireccionar raíz hacia Swagger
app.get('/', (_req, res) => {
    res.redirect('/rabbitmq/api-docs/');
});

// Archivos estáticos de documentación
app.use('/docs', express.static(path.join(__dirname, '../public/docs')));

app.get('/flujo', (_req, res) =>
    res.sendFile(path.join(__dirname, '../public/docs', 'flujo.html'))
);

// Rutas de la API
app.use('/api/notificaciones', notificacionesRouter);

module.exports = app;
