/**
 * Ejecutar UNA VEZ para crear las tablas dentro de bdSIJUDI.
 * node setupDb.js
 */
const sql = require('mssql');
const { db } = require('../src/config/env');

const masterConfig = {
    ...db,
    // Nos aseguramos de usar la BD definida en .env
    database: db.database 
};
const schema = `
-- ============================================================
-- Tabla: PUSH_Notificaciones
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PUSH_Notificaciones')
BEGIN
    CREATE TABLE PUSH_Notificaciones (
        id                      INT IDENTITY(1,1) PRIMARY KEY,
        idTramite               INT            NOT NULL,
        idCatTipoTramite        INT            NOT NULL,
        folio                   VARCHAR(100)   NOT NULL,
        accion                  VARCHAR(50)    NOT NULL,
        idAreaOrigen            INT            NOT NULL,
        idSubAreaOrigen         INT            NOT NULL,
        idSistemaPerfilOrigen   INT            NOT NULL,
        idAreaDestino           INT            NOT NULL,
        idSubAreaDestino        INT            NOT NULL,
        idSistemaPerfilDestino  INT            NOT NULL,
        mensaje                 NVARCHAR(500)  NOT NULL,
        fecha_creacion          DATETIME       DEFAULT GETDATE(),
        activa                  BIT            DEFAULT 1
    );
    PRINT 'Tabla PUSH_Notificaciones creada.';
END

-- ============================================================
-- Tabla: PUSH_NotificacionContexto
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PUSH_NotificacionContexto')
BEGIN
    CREATE TABLE PUSH_NotificacionContexto (
        id               INT IDENTITY(1,1) PRIMARY KEY,
        notificacion_id  INT      NOT NULL,
        idArea           INT      NOT NULL,
        idSubArea        INT      NOT NULL,
        idSistemaPerfil  INT      NOT NULL,
        leida            BIT      DEFAULT 0,
        fecha_lectura    DATETIME NULL,
        fecha_entrega    DATETIME DEFAULT GETDATE(),

        CONSTRAINT FK_PUSH_NotificacionContexto_Notificaciones
            FOREIGN KEY (notificacion_id)
            REFERENCES PUSH_Notificaciones(id)
    );
    PRINT 'Tabla PUSH_NotificacionContexto creada.';
END

-- ============================================================
-- Índices
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PUSH_NotificacionContexto_Unico')
BEGIN
    CREATE UNIQUE INDEX IX_PUSH_NotificacionContexto_Unico 
        ON PUSH_NotificacionContexto(notificacion_id, idArea, idSubArea, idSistemaPerfil);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PUSH_NotifContexto_Bandeja')
BEGIN
    CREATE INDEX IX_PUSH_NotifContexto_Bandeja 
        ON PUSH_NotificacionContexto(idArea, idSubArea, idSistemaPerfil, leida);
END
`;

async function setup() {
    try {
        const pool = await sql.connect(masterConfig);
        await pool.request().query(schema);
        await pool.close();
        console.log('Migraciones creadas 0.o');
    } catch (err) {
        console.error('Error en setup :( :', err.message);
        process.exit(1);
    }
}

setup();