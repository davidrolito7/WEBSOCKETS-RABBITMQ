const { getPool, sql } = require('../config/db');
const { getRabbitChannel, EXCHANGE } = require('../config/rabbitmq');

const MAX_PENDIENTES = 5;

function routingKeyContexto(idArea, idSistemaPerfil, idSubArea) {
    return `area.${idArea}.perfil.${idSistemaPerfil}.subarea.${idSubArea}`;
}

function armarOrigen(row) {
    return {
        area: { idArea: row.idAreaOrigen, descripcion: row.descArea || null },
        subArea: { idSubArea: row.idSubAreaOrigen, descripcion: row.descSubArea || null },
        sistemaPerfil: { idSistemaPerfil: row.idSistemaPerfilOrigen, descripcion: row.descSistemaPerfil || null }
    };
}

function armarTipoTramite(row) {
    return {
        idCatTipoTramite: row.idCatTipoTramite,
        descripcion: row.descTipoTramite || null,
        route: row.routeTipoTramite || null
    };
}

async function contarPendientesPorContexto(ctx) {
    const pool = await getPool();
    const result = await pool.request()
        .input('idArea', sql.Int, ctx.idArea)
        .input('idSubArea', sql.Int, ctx.idSubArea)
        .input('idSistemaPerfil', sql.Int, ctx.idSistemaPerfil)
        .query(`SELECT COUNT(*) AS total
                FROM PUSH_NotificacionContexto nc
                JOIN PUSH_Notificaciones n ON n.id = nc.notificacion_id
                WHERE nc.idArea=@idArea AND nc.idSubArea=@idSubArea AND nc.idSistemaPerfil=@idSistemaPerfil 
                AND nc.leida=0 AND n.activa=1`);
    return result.recordset[0].total;
}

// Crea notificación, registra destinatarios por contexto y publica en RabbitMQ
async function crearNotificacion(body) {
    const {
        idTramite, idCatTipoTramite, folio, mensaje,
        idAreaOrigen, idSubAreaOrigen, idSistemaPerfilOrigen,
        idAreaDestino, idSubAreaDestino, idSistemaPerfilDestino
    } = body;

    const pool = await getPool();

    const ins = await pool.request()
        .input('idTramite', sql.Int, idTramite)
        .input('idCatTipoTramite', sql.Int, idCatTipoTramite)
        .input('folio', sql.VarChar(100), folio)
        .input('idAreaOrigen', sql.Int, idAreaOrigen)
        .input('idSubAreaOrigen', sql.Int, idSubAreaOrigen)
        .input('idSistemaPerfilOrigen', sql.Int, idSistemaPerfilOrigen)
        .input('idAreaDestino', sql.Int, idAreaDestino)
        .input('idSubAreaDestino', sql.Int, idSubAreaDestino)
        .input('idSistemaPerfilDestino', sql.Int, idSistemaPerfilDestino)
        .input('mensaje', sql.NVarChar(500), mensaje)
        .query(`INSERT INTO PUSH_Notificaciones
                    (idTramite, idCatTipoTramite, folio, 
                     idAreaOrigen, idSubAreaOrigen, idSistemaPerfilOrigen, 
                     idAreaDestino, idSubAreaDestino, idSistemaPerfilDestino, mensaje)
                OUTPUT INSERTED.id
                VALUES (@idTramite, @idCatTipoTramite, @folio, 
                        @idAreaOrigen, @idSubAreaOrigen, @idSistemaPerfilOrigen, 
                        @idAreaDestino, @idSubAreaDestino, @idSistemaPerfilDestino, @mensaje)`);

    const notificacion_id = ins.recordset[0].id;

    // Insertar el contexto destino en NotificacionContexto
    await pool.request()
        .input('notificacion_id', sql.Int, notificacion_id)
        .input('idArea', sql.Int, idAreaDestino)
        .input('idSubArea', sql.Int, idSubAreaDestino)
        .input('idSistemaPerfil', sql.Int, idSistemaPerfilDestino)
        .query(`INSERT INTO PUSH_NotificacionContexto 
                    (notificacion_id, idArea, idSubArea, idSistemaPerfil) 
                VALUES (@notificacion_id, @idArea, @idSubArea, @idSistemaPerfil)`);

    // Enriquecer la notificación con las descripciones de los catálogos de bdSIJUDI
    const desc = await pool.request()
        .input('idCatTipoTramite', sql.Int, idCatTipoTramite)
        .input('idArea', sql.Int, idAreaOrigen)
        .input('idSubArea', sql.Int, idSubAreaOrigen)
        .input('idSistemaPerfil', sql.Int, idSistemaPerfilOrigen)
        .query(`SELECT
                    (SELECT Nombre FROM dbo.ADM_AREA WHERE IdArea = @idArea) AS descArea,
                    (SELECT Descripcion FROM dbo.ADM_SUBAREA WHERE IdSubArea = @idSubArea) AS descSubArea,
                    (SELECT Descripcion FROM dbo.ADM_SISTEMA_PERFILES WHERE IdSistemaPerfil = @idSistemaPerfil) AS descSistemaPerfil,
                    tt.Descripcion AS descTipoTramite,
                    tt.Route AS routeTipoTramite
                FROM (SELECT 1 AS x) d
                LEFT JOIN dbo.OFD_CAT_TipoTramites tt ON tt.IdCatTipoTramite = @idCatTipoTramite`);

    const notificacionEnriquecida = {
        id: notificacion_id,
        idTramite,
        idCatTipoTramite,
        folio,
        mensaje,
        fecha_creacion: new Date().toISOString(),
        leida: false,
        idAreaDestino,
        idSubAreaDestino,
        idSistemaPerfilDestino,
        tipoTramite: armarTipoTramite({ idCatTipoTramite, ...desc.recordset[0] }),
        origen: armarOrigen({ idAreaOrigen, idSubAreaOrigen, idSistemaPerfilOrigen, ...desc.recordset[0] })
    };

    // Publicar el objeto enriquecido en RabbitMQ
    const ch = await getRabbitChannel();
    const routingKey = routingKeyContexto(idAreaDestino, idSistemaPerfilDestino, idSubAreaDestino);
    ch.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(notificacionEnriquecida)), { persistent: true });

    return notificacionEnriquecida;
}

// Bandeja: devuelve todas las notificaciones sin límite
async function leerNotificacionesPorContexto(ctx) {
    const pendientes = await contarPendientesPorContexto(ctx);

    const pool = await getPool();
    
    const result = await pool.request()
        .input('idArea', sql.Int, ctx.idArea)
        .input('idSubArea', sql.Int, ctx.idSubArea)
        .input('idSistemaPerfil', sql.Int, ctx.idSistemaPerfil)
        .query(`SELECT n.id, n.idTramite, n.idCatTipoTramite, n.folio,
                       n.idAreaOrigen, n.idSubAreaOrigen, n.idSistemaPerfilOrigen, n.mensaje, n.fecha_creacion,
                       nc.leida,
                       a.Nombre AS descArea, sa.Descripcion AS descSubArea, sp.Descripcion AS descSistemaPerfil,
                       tt.Descripcion AS descTipoTramite, tt.Route AS routeTipoTramite
                FROM PUSH_NotificacionContexto nc
                JOIN PUSH_Notificaciones n ON n.id=nc.notificacion_id
                LEFT JOIN dbo.ADM_AREA a ON a.IdArea = n.idAreaOrigen
                LEFT JOIN dbo.ADM_SUBAREA sa ON sa.IdSubArea = n.idSubAreaOrigen
                LEFT JOIN dbo.ADM_SISTEMA_PERFILES sp ON sp.IdSistemaPerfil = n.idSistemaPerfilOrigen
                LEFT JOIN dbo.OFD_CAT_TipoTramites tt ON tt.IdCatTipoTramite = n.idCatTipoTramite
                WHERE nc.idArea=@idArea AND nc.idSubArea=@idSubArea AND nc.idSistemaPerfil=@idSistemaPerfil 
                AND n.activa=1
                ORDER BY n.fecha_creacion DESC`);

    const notificacionesEnriquecidas = result.recordset.map(notif => ({
        id: notif.id,
        idTramite: notif.idTramite,
        idCatTipoTramite: notif.idCatTipoTramite,
        folio: notif.folio,
        mensaje: notif.mensaje,
        fecha_creacion: notif.fecha_creacion,
        leida: notif.leida,
        tipoTramite: armarTipoTramite(notif),
        origen: armarOrigen(notif)
    }));

    return { soloConteo: false, pendientes, notificaciones: notificacionesEnriquecidas };
}

// Marca leída para todo un contexto
async function marcarLeidaPorContexto(notificacion_id, ctx) {
    const pool = await getPool();
    const result = await pool.request()
        .input('nid', sql.Int, notificacion_id)
        .input('idArea', sql.Int, ctx.idArea)
        .input('idSubArea', sql.Int, ctx.idSubArea)
        .input('idSistemaPerfil', sql.Int, ctx.idSistemaPerfil)
        .query(`UPDATE PUSH_NotificacionContexto 
                SET leida=1, fecha_lectura=GETDATE() 
                WHERE notificacion_id=@nid AND idArea=@idArea AND idSubArea=@idSubArea AND idSistemaPerfil=@idSistemaPerfil`);
    return result.rowsAffected[0] > 0;
}

module.exports = {
    crearNotificacion,
    leerNotificacionesPorContexto,
    marcarLeidaPorContexto,
    routingKeyContexto
};
