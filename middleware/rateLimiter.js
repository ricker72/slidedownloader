/**
 * Middleware de rate limiting por IP (ventana fija en memoria).
 * Diseñado para proteger los endpoints públicos de SlideDownloader contra
 * abuso y agotamiento de recursos (DoS, proxy de ancho de banda, caché lleno).
 *
 * Cada limitador mantiene su propio almacén. Antes todos compartían un único
 * Map indexado solo por IP, así que agotar /api/health bloqueaba también
 * /api/download y el resto de endpoints.
 *
 * No requiere dependencias externas. En Vercel cada instancia tiene su propia
 * memoria: el límite es por instancia, no global.
 */

// Un almacén por limitador. El registro permite limpiar entradas expiradas.
const stores = new Set();

/**
 * Limpia entradas expiradas de todos los almacenes para evitar crecimiento
 * ilimitado. Se ejecuta cada 5 minutos.
 */
setInterval(() => {
  const now = Date.now();
  for (const store of stores) {
    for (const [key, value] of store.entries()) {
      if (now - value.inicioVentana >= value.windowMs) {
        store.delete(key);
      }
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * Crea un middleware de rate limiting con su propio contador.
 *
 * @param {object} options
 * @param {number} options.windowMs - Duración de la ventana en ms.
 * @param {number} options.max - Máximo de peticiones por ventana.
 * @param {string} options.message - Mensaje de error devuelto al exceder el límite.
 * @param {number} options.statusCode - Código HTTP de la respuesta (default 429).
 * @returns {Function} Middleware Express.
 */
function rateLimiter({ windowMs = 60 * 1000, max = 60, message = 'Demasiadas peticiones. Intenta de nuevo más tarde.', statusCode = 429 } = {}) {
  const store = new Map();
  stores.add(store);

  return (req, res, next) => {
    // Usar req.ip (Express ya resuelve trust proxy si está configurado).
    const ip = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();

    let entry = store.get(ip);

    if (!entry || now - entry.inicioVentana >= windowMs) {
      entry = { contador: 0, inicioVentana: now, windowMs };
      store.set(ip, entry);
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

/**
 * Vacía todos los contadores. Pensado para pruebas que comparten proceso.
 */
function resetRateLimitStores() {
  for (const store of stores) {
    store.clear();
  }
}

// Instancias preconfiguradas por endpoint.
const apiLimiter = rateLimiter({ windowMs: 60 * 1000, max: 60 });
const inspectLimiter = rateLimiter({ windowMs: 60 * 1000, max: 10 });
const downloadLimiter = rateLimiter({ windowMs: 60 * 1000, max: 5 });
const promptLimiter = rateLimiter({ windowMs: 60 * 1000, max: 10 });
const fileLimiter = rateLimiter({ windowMs: 60 * 1000, max: 20 });
const searchConfigLimiter = rateLimiter({ windowMs: 60 * 1000, max: 30 });
const pingLimiter = rateLimiter({ windowMs: 60 * 1000, max: 60 });

// Scribd: cada análisis o descarga hace varias peticiones al CDN externo.
const scribdInspectLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Demasiados análisis de Scribd. Espera unos minutos antes de reintentar.'
});
const scribdDownloadLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: 'Demasiadas descargas de Scribd. Espera unos minutos antes de reintentar.'
});
const scribdPreviewLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Demasiadas vistas previas de Scribd. Espera unos minutos antes de reintentar.'
});

module.exports = {
  rateLimiter,
  resetRateLimitStores,
  apiLimiter,
  inspectLimiter,
  downloadLimiter,
  promptLimiter,
  fileLimiter,
  searchConfigLimiter,
  pingLimiter,
  scribdInspectLimiter,
  scribdDownloadLimiter,
  scribdPreviewLimiter
};
