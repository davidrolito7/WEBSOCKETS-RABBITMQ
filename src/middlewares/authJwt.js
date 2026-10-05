const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { jwt: jwtConfig, isProduction } = require('../config/env');

const authority = jwtConfig.authority.replace(/\/$/, '');
const audience = jwtConfig.audience;
const CLAIM_USERDATA = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/userdata';

let clientPromise = null;

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: {
            Accept: 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} al consultar ${url}`);
    }

    return response.json();
}

async function createJwksClient() {
    const discoveryUrl = `${authority}/.well-known/openid-configuration`;
    const discovery = await fetchJson(discoveryUrl);

    if (!discovery.jwks_uri) {
        throw new Error('No se encontró jwks_uri');
    }

    return jwksClient({
        jwksUri: discovery.jwks_uri,
        cache: true,
        cacheMaxEntries: 5,
        cacheMaxAge: 60 * 60 * 1000,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        timeout: 5000
    });
}

async function getJwksClient() {
    if (!clientPromise) {
        clientPromise = createJwksClient().catch((err) => {
            clientPromise = null;
            throw err;
        });
    }

    return clientPromise;
}

function getKey(header, callback) {
    (async () => {
        try {
            if (!header?.kid) {
                throw new Error('JWT_MISSING_KID');
            }

            if (header.alg !== 'RS256') {
                throw new Error('JWT_UNSUPPORTED_ALG');
            }

            const client = await getJwksClient();
            const key = await client.getSigningKey(header.kid);

            callback(null, key.getPublicKey());
        } catch (err) {
            callback(err);
        }
    })();
}

function verifyToken(token) {
    return new Promise((resolve, reject) => {
        jwt.verify(
            token,
            getKey,
            {
                algorithms: ['RS256'],
                issuer: authority,
                audience
            },
            (err, decoded) => {
                if (err) return reject(err);
                resolve(decoded);
            }
        );
    });
}

function parseUserdata(decoded) {
    let userdata = decoded?.[CLAIM_USERDATA];

    if (!userdata) {
        throw new Error('CLAIM_USERDATA_MISSING');
    }

    if (typeof userdata === 'string') {
        try {
            userdata = JSON.parse(userdata);
        } catch {
            throw new Error('CLAIM_USERDATA_INVALID_JSON');
        }
    }

    if (typeof userdata !== 'object' || Array.isArray(userdata)) {
        throw new Error('CLAIM_USERDATA_INVALID');
    }

    return userdata;
}

function parsePositiveInteger(value, fieldName) {
    const number = Number(value);

    if (!Number.isInteger(number) || number <= 0) {
        throw new Error(`INVALID_${fieldName}`);
    }

    return number;
}

function getUserContextFromDecodedToken(decoded) {
    const userdata = parseUserdata(decoded);

    return {
        idArea: parsePositiveInteger(userdata.idArea, 'idArea'),
        idSubArea: parsePositiveInteger(userdata.idSubArea, 'idSubArea'),
        idSistemaPerfil: parsePositiveInteger(userdata.idSistemaPerfil, 'idSistemaPerfil')
    };
}

async function getUserContextFromToken(token) {
    const decoded = await verifyToken(token);
    return getUserContextFromDecodedToken(decoded);
}

function getJwtErrorMessage(err) {
    if (err.name === 'TokenExpiredError') {
        return 'Token expirado';
    }

    if (err.name === 'JsonWebTokenError') {
        if (err.message.includes('audience')) return 'Audiencia (aud) inválida';
        if (err.message.includes('issuer')) return 'Emisor (iss) inválido';
        if (err.message.includes('signature')) return 'Firma inválida';

        return `Error de JWT: ${err.message}`;
    }

    switch (err.message) {
        case 'CLAIM_USERDATA_MISSING':
            return 'El token no contiene userdata';
        case 'CLAIM_USERDATA_INVALID_JSON':
            return 'El claim userdata no contiene JSON válido';
        case 'CLAIM_USERDATA_INVALID':
            return 'El claim userdata tiene formato inválido';
        case 'JWT_MISSING_KID':
            return 'El JWT no trae kid en el header';
        case 'JWT_UNSUPPORTED_ALG':
            return 'Algoritmo JWT no soportado';
        default:
            return `Token inválido: ${err.message}`;
    }
}

async function authJwt(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            status: 401,
            mensaje: 'Token no proporcionado',
            data: null,
            error: 'No se incluyó la cabecera Authorization: Bearer <token>'
        });
    }

    const token = authHeader.slice(7).trim();

    try {
        req.user = await getUserContextFromToken(token);
        next();
    } catch (err) {
        console.error('[authJwt] Error de verificación de token:', err);

        return res.status(401).json({
            success: false,
            status: 401,
            mensaje: 'Autenticación fallida',
            data: null,
            error: isProduction ? 'Token inválido o expirado' : getJwtErrorMessage(err)
        });
    }
}

module.exports = {
    authJwt,
    verifyToken,
    getUserContextFromToken,
    getUserContextFromDecodedToken
};