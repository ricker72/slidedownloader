/**
 * Único punto de respuesta para los errores de la API.
 *
 * Mantiene el cuerpo histórico `{success:false,error}` y publica el código del
 * catálogo solo en `X-Error-Code`/logs, nunca en el JSON. Cada ruta decide si
 * enmascara los 5xx en producción; por defecto se enmascaran.
 */

const { toPublicError } = require('../services/errors');
const { getRuntime } = require('../config');

function sendError(res, error, options = {}) {
  const {
    label = 'Error',
    log = true,
    logStack = false,
    ...publicOptions
  } = options;

  const publicError = toPublicError(error, {
    isProduction: getRuntime().isProduction,
    ...publicOptions
  });

  if (log && publicError.status >= 500) {
    const detail = logStack && error && error.stack ? error.stack : error && error.message;
    console.error(`${label}:`, detail || error);
  }

  if (publicError.code) res.set('X-Error-Code', publicError.code);

  return res.status(publicError.status).json({ success: false, error: publicError.message });
}

/** Middleware final de Express: recoge cualquier error pasado con `next`. */
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  return sendError(res, error, {
    label: 'Error no controlado',
    logStack: true
  });
}

module.exports = { sendError, errorHandler };
