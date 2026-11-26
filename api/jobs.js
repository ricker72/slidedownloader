/**
 * Endpoints opt-in de trabajos asíncronos.
 *
 * Se montan solo cuando JOBS_ENABLED=true. `/api/download` conserva su
 * contrato sincrónico (archivo en la misma respuesta) por defecto.
 *
 * La URL de sondeo lleva un token de posesión: el UUID del trabajo no es
 * suficiente para autorizar consultas. El token se guarda como hash SHA-256
 * y se compara en tiempo constante.
 */

const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');

const { DownloadValidationError, validateDownloadRequest } = require('../services/downloadService');
const { hashToken, safeTokenEqual, toPublicJob } = require('../services/jobStore');
const { jobsLimiter, jobPollLimiter, fileLimiter } = require('../middleware/rateLimiter');
const { isValidJobId } = require('../utils/downloadJob');

const MAX_FILENAME_LENGTH = 200;

function configuredJobTtlMs() {
  const ttl = Number(process.env.JOB_TTL_MS);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : undefined;
}

function configuredMaxQueue() {
  const max = Number(process.env.MAX_JOB_QUEUE);
  return Number.isFinite(max) && max > 0 ? Math.floor(max) : 50;
}

/**
 * El token puede viajar en la URL (contrato ya publicado) o en una cabecera,
 * que es la forma preferida porque no acaba en logs ni en el historial.
 */
function getRequestToken(req) {
  const authorization = req.get('authorization');
  if (authorization && /^Bearer\s+/i.test(authorization)) {
    return authorization.replace(/^Bearer\s+/i, '').trim();
  }

  const headerToken = req.get('x-job-token');
  if (headerToken) return String(headerToken);

  const queryToken = req.query.token;
  return typeof queryToken === 'string' && queryToken ? queryToken : null;
}

function safeArtifactFileName(fileName) {
  const base = path.basename(String(fileName || ''));
  if (!base || base === '.' || base === '..' || base.includes('\\')) return null;
  if (base.length > MAX_FILENAME_LENGTH) return null;
  return base;
}

function createJobsRouter({ jobStore, artifactStore, isEnabled = true } = {}) {
  const router = express.Router();

  router.use((req, res, next) => {
    // Las respuestas contienen capabilities: nunca deben cachearse ni
    // filtrarse como referrer a terceros.
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');

    if (!isEnabled) {
      return res.status(404).json({ success: false, error: 'No encontrado' });
    }
    next();
  });

  router.post('/api/jobs', jobsLimiter, (req, res) => {
    try {
      const request = validateDownloadRequest(req.body);

      if (jobStore.queuedCount() >= configuredMaxQueue()) {
        return res.status(503).json({
          success: false,
          error: 'La cola de trabajos está llena. Intenta de nuevo más tarde.'
        });
      }

      const token = crypto.randomBytes(32).toString('base64url');
      const job = jobStore.create({
        id: crypto.randomUUID(),
        ttlMs: configuredJobTtlMs(),
        tokenHash: hashToken(token),
        payload: {
          url: request.url,
          format: request.format,
          quality: request.quality,
          imageUrls: request.imageUrls,
          title: request.title
        }
      });

      return res.status(202).json({
        success: true,
        jobId: job.id,
        status: job.status,
        pollUrl: `/api/jobs/${job.id}?token=${encodeURIComponent(token)}`,
        token
      });
    } catch (error) {
      if (error instanceof DownloadValidationError) {
        return res.status(error.status).json({ success: false, error: error.message });
      }

      console.error('Error en /api/jobs:', error.message);
      return res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production'
          ? 'Error interno del servidor'
          : error.message
      });
    }
  });

  router.get('/api/jobs/:id/artifact/:filename', fileLimiter, async (req, res) => {
    const { id, filename } = req.params;
    const safeName = safeArtifactFileName(filename);

    if (!isValidJobId(id) || !safeName) {
      return res.status(400).json({ success: false, error: 'ID o archivo inválido' });
    }

    const token = getRequestToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token requerido' });
    }

    const job = jobStore.get(id);
    const artifactTokenHash = job?.result?.artifactTokenHash || job?.tokenHash;
    if (!job || !safeTokenEqual(artifactTokenHash, token)) {
      return res.status(404).json({ success: false, error: 'Trabajo no encontrado' });
    }

    if (job.result?.expiresAt && Date.now() > job.result.expiresAt) {
      return res.status(410).json({ success: false, error: 'El enlace de descarga ha caducado' });
    }

    const artifactKey = `jobs/${id}/${safeName}`;
    if (!job.result || job.result.artifactKey !== artifactKey) {
      return res.status(404).json({ success: false, error: 'Archivo no disponible' });
    }

    try {
      const data = await artifactStore.get(artifactKey);
      if (!data) {
        return res.status(404).json({ success: false, error: 'Archivo no disponible' });
      }

      const contentType = await artifactStore.getContentType(artifactKey);
      res.set('Content-Type', contentType || job.result.contentType || 'application/octet-stream');
      res.set('Content-Disposition', `attachment; filename="${safeName.replace(/"/g, '')}"`);
      res.set('Cache-Control', 'no-store');
      return res.status(200).send(data);
    } catch (error) {
      console.error('Error al servir artefacto:', error.message);
      return res.status(500).json({ success: false, error: 'No se pudo leer el archivo' });
    }
  });

  router.get('/api/jobs/:id', jobPollLimiter, (req, res) => {
    const { id } = req.params;

    if (!isValidJobId(id)) {
      return res.status(400).json({ success: false, error: 'ID de trabajo inválido' });
    }

    const token = getRequestToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token requerido' });
    }

    const job = jobStore.get(id);
    if (!job || !safeTokenEqual(job.tokenHash, token)) {
      return res.status(404).json({ success: false, error: 'Trabajo no encontrado' });
    }

    return res.status(200).json({
      success: true,
      job: toPublicJob(job),
      pollAfterMs: 2000
    });
  });

  return router;
}

module.exports = {
  createJobsRouter,
  safeArtifactFileName,
  getRequestToken
};
