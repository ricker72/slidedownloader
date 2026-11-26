/**
 * Contrato de persistencia de trabajos asíncronos.
 *
 * El núcleo de la aplicación solo depende de estos métodos, así que la
 * implementación en memoria sirve para tests y desarrollo local, y un
 * adaptador de Redis (o similar) puede sustituirla en producción sin tocar
 * los endpoints ni el worker.
 *
 * Un trabajo tiene esta forma:
 * {
 *   id, status ('queued'|'running'|'done'|'failed'),
 *   payload: { url, format, quality, imageUrls, title },
 *   tokenHash, attempts, progress, claimToken,
 *   result, error, createdAt, updatedAt, expiresAt
 * }
 */

const crypto = require('node:crypto');
const { isValidJobId } = require('../utils/downloadJob');

const JOB_STATUSES = ['queued', 'running', 'done', 'failed'];
const DEFAULT_JOB_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 2;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

/** Comparación en tiempo constante del token de posesión. */
function safeTokenEqual(expectedHash, providedToken) {
  const actual = Buffer.from(hashToken(providedToken), 'hex');
  const expected = Buffer.from(String(expectedHash || ''), 'hex');

  if (actual.length !== expected.length || expected.length === 0) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function normalizeJob(input) {
  const now = Date.now();
  const ttl = Number.isFinite(Number(input.ttlMs)) && Number(input.ttlMs) > 0
    ? Number(input.ttlMs)
    : DEFAULT_JOB_TTL_MS;

  return {
    id: String(input.id),
    status: JOB_STATUSES.includes(input.status) ? input.status : 'queued',
    payload: { ...(input.payload || {}) },
    tokenHash: String(input.tokenHash || ''),
    attempts: Number(input.attempts) || 0,
    progress: Number(input.progress) || 0,
    claimToken: input.claimToken || null,
    nextAttemptAt: Math.max(0, Number(input.nextAttemptAt) || 0),
    result: input.result || null,
    error: input.error || null,
    createdAt: Number(input.createdAt) || now,
    updatedAt: Number(input.updatedAt) || now,
    expiresAt: Number(input.expiresAt) || now + ttl
  };
}

/** Vista pública de un trabajo: nunca incluye secreto ni URL de origen. */
function toPublicJob(job) {
  if (!job) return null;

  const publicJob = {
    id: job.id,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };

  if (job.status === 'done' && job.result) {
    publicJob.result = {
      fileName: job.result.fileName,
      title: job.result.title,
      format: job.result.format,
      quality: job.result.quality,
      slideCount: job.result.slideCount,
      downloadUrl: job.result.downloadUrl,
      expiresAt: job.result.expiresAt
    };
  }

  if (job.status === 'failed' && job.error) {
    publicJob.error = job.error;
  }

  return publicJob;
}

class MemoryJobStore {
  constructor() {
    this.jobs = new Map();
  }

  create(input) {
    const job = normalizeJob(input);

    if (!isValidJobId(job.id)) {
      throw new Error('ID de trabajo inválido');
    }

    this.jobs.set(job.id, job);
    return { ...job, payload: { ...job.payload } };
  }

  get(id) {
    const job = this.jobs.get(String(id));

    if (!job) return null;
    if (job.expiresAt <= Date.now()) {
      this.jobs.delete(String(id));
      return null;
    }

    return { ...job, payload: { ...job.payload } };
  }

  update(id, patch) {
    const job = this.get(id);
    if (!job) return null;

    const updated = normalizeJob({
      ...job,
      ...patch,
      payload: patch?.payload ? { ...job.payload, ...patch.payload } : job.payload,
      id: job.id,
      createdAt: job.createdAt,
      expiresAt: job.expiresAt,
      updatedAt: Number(patch?.updatedAt) || Date.now()
    });

    this.jobs.set(job.id, updated);
    return { ...updated, payload: { ...updated.payload } };
  }

  /**
   * Reclama el trabajo `queued` más antiguo de forma atómica en el proceso.
   * Devuelve null si no hay trabajo pendiente.
   */
  claimNext(workerId) {
    const now = Date.now();
    const claimToken = crypto.randomBytes(24).toString('hex');

    for (const [id, job] of this.jobs) {
      if (job.status !== 'queued' || job.expiresAt <= now) continue;
      if (job.nextAttemptAt > now) continue;

      const claimed = this.update(id, {
        status: 'running',
        claimToken,
        workerId: String(workerId || 'worker'),
        attempts: job.attempts + 1,
        progress: 1
      });

      return { job: claimed, claimToken };
    }

    return null;
  }

  /** Devuelve trabajos `running` cuya reclamación ha caducado (para reintentos). */
  listStaleRunning(staleAfterMs) {
    const limit = Date.now() - Number(staleAfterMs || 0);

    return [...this.jobs.values()]
      .filter((job) => job.status === 'running' && job.updatedAt <= limit)
      .map((job) => ({ ...job, payload: { ...job.payload } }));
  }

  queuedCount() {
    const now = Date.now();
    let count = 0;

    for (const job of this.jobs.values()) {
      if (job.status === 'queued' && job.expiresAt > now && job.nextAttemptAt <= now) count += 1;
    }

    return count;
  }

  get size() {
    return this.jobs.size;
  }

  delete(id) {
    return this.jobs.delete(String(id));
  }

  deleteExpired() {
    const now = Date.now();
    let deleted = 0;

    for (const [id, job] of this.jobs) {
      if (job.expiresAt <= now) {
        this.jobs.delete(id);
        deleted += 1;
      }
    }

    return deleted;
  }
}

module.exports = {
  JOB_STATUSES,
  DEFAULT_JOB_TTL_MS,
  DEFAULT_MAX_ATTEMPTS,
  hashToken,
  safeTokenEqual,
  toPublicJob,
  MemoryJobStore
};
