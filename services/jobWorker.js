/**
 * Consumidor de trabajos en background.
 *
 * Reutiliza `generateDownload` (la misma lógica que `/api/download`) y guarda
 * el resultado en el `ArtifactStore`, nunca en `/tmp`, porque en serverless
 * otra invocación no lo encontraría.
 *
 * Un único tick procesa como máximo un trabajo y mantiene el lease del job
 * para que dos ticks no generen el mismo archivo a la vez.
 */

const crypto = require('node:crypto');
const path = require('node:path');

const { generateDownload, DownloadValidationError } = require('./downloadService');
const { progressPercent } = require('./progressTracker');
const { hashToken, DEFAULT_MAX_ATTEMPTS } = require('./jobStore');
const { MIME_BY_EXTENSION } = require('../utils/fileResponse');
const { cleanupJobDirAsync } = require('../utils/downloadJob');
const { DEFAULT_MAX_ARTIFACT_BYTES } = require('./artifactStore');
const { getRuntime } = require('../config');

// Por encima de MAX_DOWNLOAD_MS (5 min en local): una conversión larga no
// debe ser reclamada por otro tick mientras sigue descargando imágenes.
const DEFAULT_CLAIM_STALE_MS = 15 * 60 * 1000;
const DEFAULT_STALE_SCAN_MS = 30 * 1000;
const DEFAULT_URL_TTL_MS = 15 * 60 * 1000;

function safeFileName(value, format) {
  const raw = String(value || `presentacion.${format || 'pdf'}`);
  const base = path.basename(raw).replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 160);
  return base || `presentacion.${format || 'pdf'}`;
}

function retryDelayMs(attempts) {
  return Math.min(2000 * (2 ** Math.max(0, attempts - 1)), 30_000);
}

/** Texto corto y sin datos sensibles para el sondeo del navegador. */
function progressDetail(state) {
  if (state.stage === 'analyzing') return 'Analizando presentación';
  if (state.stage === 'downloading-images') {
    return state.total ? `Descargando ${state.current}/${state.total}` : 'Descargando imágenes';
  }
  if (state.stage === 'generating-file') {
    return `Generando ${String(state.format || 'archivo').toUpperCase()}`;
  }
  if (state.stage === 'failed') return 'No se pudo generar el archivo';
  return '';
}

function isPermanentError(error) {
  if (error instanceof DownloadValidationError) return true;
  const status = Number(error?.status);
  return Number.isInteger(status) && status >= 400 && status < 500;
}

/** Limpieza periódica de trabajos y artefactos caducados. */
async function sweepExpired({ jobStore, artifactStore }) {
  const jobs = jobStore.deleteExpired();
  const artifacts = await artifactStore.deleteExpired();
  return { jobs, artifacts };
}

/**
 * Procesa como máximo un trabajo. Devuelve `{ processed: false, staleScanned }`
 * si la cola está vacía, o `{ processed: true, jobId, status, error }` tras el
 * intento. `staleScanned` indica al llamador que debe actualizar su ventana.
 */
async function processNextJob(options = {}) {
  const {
    jobStore,
    artifactStore,
    generate = generateDownload,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    claimStaleMs = DEFAULT_CLAIM_STALE_MS,
    staleScanMs = DEFAULT_STALE_SCAN_MS,
    lastStaleScanAt = 0,
    maxArtifactBytes = DEFAULT_MAX_ARTIFACT_BYTES,
    workerId = 'job-worker',
    isProduction = getRuntime().isProduction
  } = options;

  if (!jobStore || !artifactStore) {
    throw new Error('processNextJob requiere jobStore y artifactStore');
  }

  const now = Date.now();
  let staleScanned = false;

  // Escanear trabajos abandonados es O(N): como máximo una vez por ventana.
  if (now - Number(lastStaleScanAt) >= staleScanMs) {
    staleScanned = true;

    for (const stale of jobStore.listStaleRunning(claimStaleMs)) {
      jobStore.update(stale.id, {
        status: 'queued',
        claimToken: null,
        progress: 0,
        attempts: stale.attempts,
        nextAttemptAt: 0
      });
    }
  }

  const claimed = jobStore.claimNext(workerId);
  if (!claimed) return { processed: false, staleScanned };

  const { job, claimToken } = claimed;
  const attempts = job.attempts;

  try {
    const progressState = { stage: 'preparing', current: 0, total: null, failed: 0, format: job.payload.format };
    let lastPublished = { stage: '', percent: -10 };

    const onProgress = (patch = {}) => {
      Object.assign(progressState, patch);

      const percent = progressPercent(progressState);
      const stage = progressState.stage;
      if (stage === lastPublished.stage && percent - lastPublished.percent < 5) return;

      lastPublished = { stage, percent };
      jobStore.update(job.id, {
        progress: percent,
        stage,
        detail: progressDetail(progressState)
      });
    };

    const result = await generate(job.payload, { onProgress });

    // Si otro worker recuperó el lease, no publicamos su resultado.
    const current = jobStore.get(job.id);
    if (!current || current.claimToken !== claimToken) {
      await cleanupJobDirAsync(result.filePath);
      return { processed: true, jobId: job.id, status: 'superseded', attempts, staleScanned };
    }

    const format = String(result.format || job.payload.format || 'pdf').toLowerCase();
    const fileName = safeFileName(result.fileName, format);
    const artifactKey = `jobs/${job.id}/${fileName}`;
    const contentType = MIME_BY_EXTENSION[path.extname(fileName).toLowerCase()]
      || 'application/octet-stream';

    const stored = await artifactStore.put(artifactKey, result.filePath, {
      contentType,
      maxBytes: maxArtifactBytes
    });
    // La URL siempre apunta a esta API, nunca al proveedor de almacenamiento.
    // El token es distinto del de sondeo y caduca antes que el trabajo.
    const artifactToken = crypto.randomBytes(24).toString('base64url');
    const downloadUrl = `/api/jobs/${job.id}/artifact/${encodeURIComponent(fileName)}`
      + `?token=${encodeURIComponent(artifactToken)}`;

    jobStore.update(job.id, {
      status: 'done',
      progress: 100,
      stage: 'done',
      detail: 'Archivo listo',
      claimToken: null,
      result: {
        fileName,
        title: result.title,
        format,
        quality: result.quality || job.payload.quality,
        slideCount: result.imageCount,
        artifactKey: stored.key,
        contentType,
        artifactTokenHash: hashToken(artifactToken),
        downloadUrl,
        expiresAt: Date.now() + DEFAULT_URL_TTL_MS
      }
    });

    await cleanupJobDirAsync(result.filePath);

    return { processed: true, jobId: job.id, status: 'done', attempts, staleScanned };
  } catch (error) {
    console.error(`Error procesando job ${job.id}:`, error.message);

    const permanent = isPermanentError(error);
    const canRetry = !permanent && attempts < Number(maxAttempts);
    const errorMessage = isProduction ? 'Error interno del servidor' : error.message;

    jobStore.update(job.id, {
      status: canRetry ? 'queued' : 'failed',
      progress: 0,
      stage: canRetry ? 'queued' : 'failed',
      detail: canRetry ? '' : 'No se pudo generar el archivo',
      claimToken: null,
      nextAttemptAt: canRetry ? Date.now() + retryDelayMs(attempts) : 0,
      error: canRetry ? null : errorMessage
    });

    return {
      processed: true,
      jobId: job.id,
      status: canRetry ? 'queued' : 'failed',
      attempts,
      error: errorMessage,
      staleScanned
    };
  }
}

module.exports = {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_CLAIM_STALE_MS,
  DEFAULT_STALE_SCAN_MS,
  DEFAULT_URL_TTL_MS,
  safeFileName,
  retryDelayMs,
  sweepExpired,
  processNextJob
};
