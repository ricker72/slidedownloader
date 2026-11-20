/**
 * Wrapper serverless para Vercel (@vercel/node).
 * Exporta la aplicación Express como handler.
 *
 * Limitaciones conocidas en Vercel:
 * - Playwright/Chromium no funciona en funciones serverless estándar
 *   (falta de bibliotecas del sistema y límite de tamaño).
 *   El endpoint /api/inspect intenta primero un método "lite" (sin browser).
 * - El sistema de archivos es de solo lectura excepto /tmp. Por eso
 *   /api/download y /api/scribd/download generan el archivo en /tmp y lo
 *   envían en la misma respuesta HTTP; no se devuelve una URL que una
 *   petición posterior podría no encontrar en otra instancia.
 *
 * Los routers adicionales (/api/scribd, etc.) se montan dentro de
 * server/app.js para que funcionen igual en local y en Vercel.
 */

const app = require('../server/app.js');

module.exports = app;
