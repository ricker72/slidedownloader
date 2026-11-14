/**
 * Wrapper de serverless para Vercel.
 * Exporta la aplicación Express como handler por defecto de @vercel/node.
 *
 * Notas importantes para despliegue serverless:
 * - Playwright/Chromium NO funciona en serverless de Vercel sin capas personalizadas
 *   (falta de bibliotecas del sistema y peso excesivo). El endpoint /api/inspect
 *   requiere Chromium; en producción debe reemplazarse por una alternativa
 *   sin navegador o moverse a una función con contenedor personalizado.
 * - El sistema de archivos es de solo lectura excepto /tmp. Los archivos
 *   generados en downloads/ se pierden tras la respuesta.
 *   Para /download/:jobId/:filename usar Vercel Blob, S3 u otro almacenamiento
 *   externo, o devolver el archivo directamente desde /api/download.
 */

const app = require('./server/app.js');

module.exports = app;
