/**
 * Utilidades del ciclo de vida de un trabajo de descarga.
 *
 * Cada descarga se genera en `downloads/{jobId}/...`. Como ahora el archivo
 * se envía en la misma respuesta HTTP, el directorio se borra al terminar
 * para no acumular archivos (especialmente en `/tmp` de Vercel).
 */

const fs = require('fs');
const path = require('path');

const JOB_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isValidJobId(value) {
  return typeof value === 'string' && JOB_ID_RE.test(value);
}

/**
 * Borra el directorio del trabajo al que pertenece `filePath`.
 * Solo actúa si el directorio tiene forma de UUID, para no tocar rutas ajenas.
 */
function cleanupJobDir(filePath) {
  const jobDir = path.dirname(String(filePath || ''));

  if (!isValidJobId(path.basename(jobDir))) return;

  try {
    fs.rmSync(jobDir, { recursive: true, force: true });
  } catch (error) {
    console.warn('No se pudo limpiar el directorio del trabajo:', error.message);
  }
}

module.exports = {
  JOB_ID_RE,
  isValidJobId,
  cleanupJobDir
};
