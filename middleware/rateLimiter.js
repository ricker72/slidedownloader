/**
 * Middleware de rate limiting por IP (ventana fija en memoria).
 * Diseñado para proteger los endpoints públicos de SlideDownloader contra
 * abuso y agotamiento de recursos (DoS, proxy de ancho de banda, caché lleno).
 *
 * Almacena contadores en un Map claveado por IP. Cada ventana de tiempo
 * reinicia los contadores. No requiere dependencias externas.
 */

// Almacenamiento en memoria: { claveIP: { contador, inicioVentana } }
const rateStore = new Map();

/**
 * Limpia entradas expiradas del almacene para evitar crecimiento ilimitado.
 * Se ejecuta cada 5 minutos.
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateStore.entries()) {
    if (now - value.inicioVentana > value.windowMs) {
      rateStore.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * Crea un middleware de rate limiting.
 *
 * @param {object} options
 * @param {number} options.windowMs - Duración de la ventana en ms.
 * @param {number} options.max - Máximo de peticiones por ventana.
 * @param {string} options.message - Mensaje de error devuelto al exceder el límite.
 * @param {number} options.statusCode - Código HTTP de la respuesta (default 429).
 * @returns {Function} Middleware Express.
 */
function rateLimiter({ windowMs = 60 * 1000, max = 60, message = 'Demasiadas peticiones. Intenta de nuevo más tarde.', statusCode = 429 } = {}) {
  return (req, res, next) => {
    // Usar req.ip (Express ya resuelve trust proxy si está configurado).
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    let entry = rateStore.get(ip);

    if (!entry || now - entry.inicioVentana > windowMs) {
      entry = { contador: 0, inicioVentana: now };
      rateStore.set(ip, entry);
    }

    entry.contador += 1;

    // Headers informativos para el cliente.
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - entry.contador)));
    res.set('X-RateLimit-Reset', String(Math.ceil((entry.inicioVentana + windowMs - now) / 1000)));

    if (entry.contador > max) {
      return res.status(statusCode).json({
        success: false,
        error: message,
        retryAfter: Math.ceil((entry.inicioVentana + windowMs - now) / 1000)
      });
    }

    next();
  };
}

// Instancias preconfiguradas por endpoint.
const apiLimiter = rateLimiter({ windowMs: 60 * 1000, max: 60 });
const inspectLimiter = rateLimiter({ windowMs: 60 * 1000, max: 10 });
const downloadLimiter = rateLimiter({ windowMs: 60 * 1000, max: 5 });
const promptLimiter = rateLimiter({ windowMs: 60 * 1000, max: 10 });
const fileLimiter = rateLimiter({ windowMs: 60 * 1000, max: 20 });
const searchConfigLimiter = rateLimiter({ windowMs: 60 * 1000, max: 30 });
const pingLimiter = rateLimiter({ windowMs: 60 * 1000, max: 60 });

module.exports = {
  rateLimiter,
  apiLimiter,
  inspectLimiter,
  downloadLimiter,
  promptLimiter,
  fileLimiter,
  searchConfigLimiter,
  pingLimiter
};