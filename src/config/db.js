const sql = require('mssql');
const { db } = require('./env');

let pool = null;

async function getPool() {
    if (!pool) pool = await sql.connect(db);
    return pool;
}

module.exports = { getPool, sql };
