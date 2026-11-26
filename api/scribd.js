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
  scribdDownloadLimiter,
  scribdPreviewLimiter
} = require('../middleware/rateLimiter');
const { sendError: sendApiError } = require('../middleware/errorHandler');

function sendError(res, error) {
  return sendApiError(res, error, {
    label: 'Error en /api/scribd',
    fallbackMessage: 'No se pudo procesar el documento de Scribd'
  });
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

router.get('/preview', scribdPreviewLimiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const rawUrl = req.query.url;

  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Se requiere el parámetro url con un enlace de Scribd'
    });
  }

  try {
    const preview = await scribdService.preview({ url: rawUrl, limit: req.query.pages });
    return res.json({ success: true, preview });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/download', scribdDownloadLimiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const { url, format, quality } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Se requiere el enlace del documento de Scribd'
    });
  }

  try {
    const result = await scribdService.download({ url, format, quality });

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
