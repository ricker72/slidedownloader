/**
 * Progreso efímero de las descargas sincrónicas.
 *
 * `/api/download` debe seguir enviando el archivo en la misma respuesta, así
 * que la interfaz consulta este registro mientras espera. El estado viaja por
 * un ID aleatorio de 128 bits y no contiene títulos ni URLs de origen.
 *
 * Es deliberadamente en memoria: en Vercel cada instancia tiene su propio
 * mapa, por lo que la UI trata un 404 como «progreso no disponible» y sigue
 * mostrando avisos por etapa sin contador exacto.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 200;
const MAX_TEXT_LENGTH = 16;
const STAGES = ['preparing', 'analyzing', 'downloading-images', 'generating-file', 'done', 'failed'];
const SAFE_FIELDS = ['stage', 'current', 'total', 'failed', 'format', 'quality'];

function progressPercent(state) {
  if (state.stage === 'done' || state.stage === 'failed') return 100;
  if (state.stage === 'generating-file') return 90;
  if (state.stage === 'analyzing') return 10;

  if (state.stage === 'downloading-images') {
    const total = Number(state.total);
    if (!Number.isFinite(total) || total <= 0) return 12;

    const current = Math.min(Math.max(Number(state.current) || 0, 0), total);
    return 10 + Math.round((75 * current) / total);
  }

  return 5;
}

function snapshot(state) {
  const total = Number(state.total);
  const current = Number(state.current);
  const failed = Number(state.failed);

  return {
    stage: state.stage,
    current: Number.isFinite(current) ? Math.max(0, Math.round(current)) : 0,
    total: Number.isFinite(total) && total > 0 ? Math.round(total) : null,
    failed: Number.isFinite(failed) ? Math.max(0, Math.round(failed)) : 0,
    format: state.format || '',
    quality: state.quality || '',
    percent: progressPercent(state),
    updatedAt: state.updatedAt
  };
}

class ProgressTracker {
  constructor({ ttlMs = DEFAULT_TTL_MS, maxSessions = MAX_SESSIONS } = {}) {
    this.ttlMs = Number.isFinite(Number(ttlMs)) && Number(ttlMs) > 0 ? Number(ttlMs) : DEFAULT_TTL_MS;
    this.maxSessions = Number.isFinite(Number(maxSessions)) && Number(maxSessions) > 0
      ? Math.floor(Number(maxSessions))
      : MAX_SESSIONS;
    this.sessions = new Map();
  }

  sweep() {
    const now = Date.now();
    for (const [id, state] of this.sessions) {
      if (now - state.updatedAt > this.ttlMs) this.sessions.delete(id);
    }
  }

  create(id, initial = {}) {
    if (typeof id !== 'string' || !id) return null;

    this.sweep();

    if (!this.sessions.has(id) && this.sessions.size >= this.maxSessions) {
      let oldestId = null;
      let oldestAt = Infinity;
      for (const [sessionId, state] of this.sessions) {
        if (state.updatedAt < oldestAt) {
          oldestId = sessionId;
          oldestAt = state.updatedAt;
        }
      }
      if (oldestId) this.sessions.delete(oldestId);
    }

    const state = {
      stage: 'preparing',
      current: 0,
      total: null,
      failed: 0,
      format: '',
      quality: '',
      updatedAt: Date.now()
    };

    for (const key of SAFE_FIELDS) {
      if (key === 'stage') {
        if (STAGES.includes(initial.stage)) state.stage = initial.stage;
      } else if (typeof initial[key] === 'string') {
        state[key] = initial[key].slice(0, MAX_TEXT_LENGTH);
      } else if (typeof initial[key] === 'number' && Number.isFinite(initial[key])) {
        state[key] = initial[key];
      }
    }

    this.sessions.set(id, state);
    return (patch = {}) => this.update(id, patch);
  }

  update(id, patch = {}) {
    const state = this.sessions.get(id);
    if (!state) return null;

    for (const key of SAFE_FIELDS) {
      if (!(key in patch)) continue;

      const value = patch[key];
      if (key === 'stage') {
        if (STAGES.includes(value)) state.stage = value;
      } else if (typeof value === 'string') {
        state[key] = value.slice(0, MAX_TEXT_LENGTH);
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        state[key] = value;
      }
    }

    state.updatedAt = Date.now();
    return snapshot(state);
  }

  get(id) {
    this.sweep();
    const state = this.sessions.get(id);
    return state ? snapshot(state) : null;
  }

  delete(id) {
    return this.sessions.delete(id);
  }
}

module.exports = {
  ProgressTracker,
  progressPercent,
  DEFAULT_TTL_MS,
  MAX_SESSIONS
};
