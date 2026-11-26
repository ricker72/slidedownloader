/**
 * Contrato de almacenamiento del archivo generado.
 *
 * En serverless el archivo no puede quedarse en `/tmp`: la petición que
 * descarga puede caer en otra instancia. La implementación en memoria es
 * suficiente para tests; en producción se sustituye por un adaptador de
 * Vercel Blob, S3 o equivalente.
 *
 * El adaptador solo necesita `put`, `get`, `getContentType`, `delete` y
 * `deleteExpired`. La URL pública SIEMPRE es una ruta de esta API
 * (`/api/jobs/:id/artifact/:filename`), construida por el worker: así el token
 * no depende del proveedor de almacenamiento y la UI no acepta URLs absolutas.
 */

const fs = require('node:fs').promises;
const path = require('node:path');

const DEFAULT_ARTIFACT_TTL_MS = 60 * 60 * 1000;
const DEFAULT_MAX_ARTIFACT_BYTES = 160 * 1024 * 1024;

function normalizeKey(key) {
  const raw = String(key || '');
  if (raw.includes('\\')) throw new Error('Clave de artefacto inválida');

  const normalized = path.posix.normalize(raw).replace(/^\/+/, '');

  if (
    !normalized
    || normalized === '.'
    || normalized.split('/').some((segment) => segment === '..')
  ) {
    throw new Error('Clave de artefacto inválida');
  }

  return normalized;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

class MemoryArtifactStore {
  constructor() {
    this.objects = new Map();
  }

  /**
   * Guarda un `Buffer` o un archivo en disco bajo `key`. La lectura es
   * asíncrona para no bloquear el event loop con artefactos grandes.
   */
  async put(key, source, options = {}) {
    const objectKey = normalizeKey(key);
    const data = Buffer.isBuffer(source)
      ? source
      : await fs.readFile(path.resolve(String(source)));

    const maxBytes = positiveNumber(options.maxBytes, DEFAULT_MAX_ARTIFACT_BYTES);
    if (data.length > maxBytes) {
      throw new Error(`El artefacto supera el tope de ${maxBytes} bytes`);
    }

    const ttlMs = positiveNumber(options.ttlMs, DEFAULT_ARTIFACT_TTL_MS);
    const now = Date.now();

    this.objects.set(objectKey, {
      data,
      contentType: options.contentType || 'application/octet-stream',
      createdAt: now,
      expiresAt: now + ttlMs
    });

    return { key: objectKey, size: data.length };
  }

  /**
   * Devuelve el Buffer almacenado (sin copiar) o null si no existe o caducó.
   * Express solo lee el Buffer al enviarlo, así que la referencia es segura.
   */
  async get(key) {
    const objectKey = normalizeKey(key);
    const object = this.objects.get(objectKey);

    if (!object) return null;
    if (object.expiresAt <= Date.now()) {
      this.objects.delete(objectKey);
      return null;
    }

    return object.data;
  }

  async getContentType(key) {
    const object = this.objects.get(normalizeKey(key));
    return object ? object.contentType : null;
  }

  async delete(key) {
    return this.objects.delete(normalizeKey(key));
  }

  async deleteExpired() {
    const now = Date.now();
    let deleted = 0;

    for (const [key, object] of this.objects) {
      if (object.expiresAt <= now) {
        this.objects.delete(key);
        deleted += 1;
      }
    }

    return deleted;
  }
}

module.exports = {
  DEFAULT_ARTIFACT_TTL_MS,
  DEFAULT_MAX_ARTIFACT_BYTES,
  normalizeKey,
  MemoryArtifactStore
};
