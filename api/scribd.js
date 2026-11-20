/**
 * Endpoints de Scribd.
 *
 * - GET  /api/scribd/inspect?url=...   → metadatos del documento (sin generar archivo)
 * - POST /api/scribd/download           → genera el archivo y lo envía en la
 *   misma respuesta (no una URL posterior, que en Vercel podía caer en otra
 *   instancia)
 *
 * Solo se usan las vistas públicas que Scribd entrega a cualquier visitante:
 * sin cookies, sin cuenta y sin credenciales.
 */

const express = require('express');
const router = express.Router();

const scribdService = require('../services/scribdService');
const { sendGeneratedFile } = require('../utils/fileResponse');
const { cleanupJobDir } = require('../utils/downloadJob');
const {
  scribdInspectLimiter,
  scribdDownloadLimiter
} = require('../middleware/rateLimiter');

function sendError(res, error) {
  const status = Number(error.status) || 500;

  if (status >= 500) {
    console.error('Error en /api/scribd:', error.message);
  }

  // En producción no se exponen detalles internos en los errores 500.
  const message =
    status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : error.message || 'No se pudo procesar el documento de Scribd';

  return res.status(status).json({ success: false, error: message });
}

router.get('/inspect', scribdInspectLimiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const rawUrl = req.query.url;

  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Se requiere el parámetro url con un enlace de Scribd'
    });
  }

  try {
    const document = await scribdService.inspect(rawUrl);
    return res.json({ success: true, document });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/download', scribdDownloadLimiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const { url, format } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Se requiere el enlace del documento de Scribd'
    });
  }

  try {
    const result = await scribdService.download({ url, format });

    return sendGeneratedFile(res, {
      filePath: result.filePath,
      fileName: result.fileName,
      title: result.title,
      format: result.format,
      slideCount: result.pageCount,
      totalPages: result.totalPages,
      source: result.sourceUrl,
      warnings: result.warnings,
      onCleanup: () => cleanupJobDir(result.filePath)
    });
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;
