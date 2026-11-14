/**
 * Wrapper serverless para Vercel (@vercel/node).
 * Exporta la aplicación Express como handler.
 *
 * Limitaciones conocidas en Vercel:
 * - Playwright/Chromium no funciona en funciones serverless estándar
 *   (falta de bibliotecas del sistema y límite de tamaño).
 *   El endpoint /api/inspect intenta primero un método "lite" (sin browser).
 * - El sistema de archivos es de solo lectura excepto /tmp.
 *   Los archivos generados se guardan en /tmp y se pierden al terminar la invocación.
 *   Idealmente devolver el archivo en la misma respuesta o usar Vercel Blob / S3.
 */

const app = require('../server/app.js');

module.exports = app;
