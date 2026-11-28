/**
 * Respuesta de descarga para archivos generados en el momento.
 *
 * En Vercel cada petición puede atenderse en una instancia distinta y `/tmp`
 * no se comparte entre ellas. Devolver una URL `/download/{jobId}/...` para
 * que el navegador la pida después fallaba de forma intermitente (404) y
 * dejaba archivos huérfanos.
 *
 * Por eso el archivo se transmite en la misma respuesta que lo genera. Los
 * metadatos viajan en cabeceras `X-Download-*` codificadas con
 * `encodeURIComponent` para que el frontend pueda mostrarlos sin un JSON
 * adicional.
 */

const path = require('path');

const MIME_BY_EXTENSION = {
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppsx': 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  '.potx': 'application/vnd.openxmlformats-officedocument.presentationml.template',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function encodeHeader(value) {
  return encodeURIComponent(String(value == null ? '' : value));
}

/**
 * @typedef {object} DownloadMetadata
 * @property {string} [fileName]
 * @property {string} [title]
 * @property {string} [format]
 * @property {string} [quality]
 * @property {number} [slideCount]
 * @property {number} [totalPages]
 * @property {string} [source]
 * @property {string[]} [warnings]
 * @property {number} [failedSlideCount]
 */

/**
 * Cabeceras con la información que la interfaz muestra tras la descarga.
 * Los valores no ASCII se codifican para no romper las cabeceras HTTP.
 *
 * @param {DownloadMetadata} [metadata]
 */
function buildDownloadHeaders({
  fileName,
  title,
  format,
  quality,
  slideCount,
  totalPages,
  source,
  warnings,
  failedSlideCount
} = {}) {
  const headers = {};

  if (fileName) headers['X-Download-File-Name'] = encodeHeader(fileName);
  if (title) headers['X-Download-Title'] = encodeHeader(title);
  if (format) headers['X-Download-Format'] = encodeHeader(format);
  if (quality) headers['X-Download-Quality'] = encodeHeader(quality);
  if (slideCount != null) headers['X-Download-Slides'] = String(slideCount);
  if (totalPages != null) headers['X-Download-Total-Pages'] = String(totalPages);
  if (source) headers['X-Download-Source'] = encodeHeader(source);
  if (Number.isFinite(Number(failedSlideCount)) && Number(failedSlideCount) > 0) {
    headers['X-Download-Failed-Slides'] = String(Math.round(Number(failedSlideCount)));
  }
  if (Array.isArray(warnings) && warnings.length) {
    headers['X-Download-Warnings'] = encodeHeader(warnings.join(' | '));
  }

  return headers;
}

/**
 * Envía un archivo ya generado al cliente y limpia el trabajo al terminar.
 *
 * @param {import('express').Response} res
 * @param {object} [options]
 * @param {string} [options.filePath] - Ruta absoluta del archivo generado.
 * @param {string} [options.fileName] - Nombre que verá el usuario.
 * @param {Function} [options.onCleanup] - Se ejecuta al cerrar la respuesta.
 * @returns {void}
 */
function sendGeneratedFile(res, options = {}) {
  const { filePath, fileName, onCleanup } = options;

  if (!filePath || typeof filePath !== 'string') {
    throw new Error('sendGeneratedFile requiere filePath');
  }

  // Nunca confiar en un nombre con separadores de ruta.
  const safeName = path.basename(String(fileName || path.basename(filePath)));
  const extension = path.extname(safeName).toLowerCase();

  res.setHeader('Content-Type', MIME_BY_EXTENSION[extension] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const headers = buildDownloadHeaders({ ...options, fileName: safeName });
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;

    if (typeof onCleanup !== 'function') return;

    try {
      onCleanup();
    } catch (error) {
      console.warn('No se pudo limpiar el trabajo de descarga:', error.message);
    }
  };

  const handleError = (error) => {
    if (!error) return;

    console.warn('No se pudo enviar el archivo generado:', error.message);

    if (res.headersSent) {
      if (typeof res.destroy === 'function') res.destroy(error);
      return;
    }

    const status = error.code === 'ENOENT' ? 404 : 500;

    // Ya se habían preparado cabeceras de archivo; si falla antes de enviar
    // nada hay que quitarlas para que el error se lea como JSON.
    if (typeof res.removeHeader === 'function') {
      for (const name of ['Content-Type', 'Content-Disposition', ...Object.keys(headers)]) {
        res.removeHeader(name);
      }
    }

    res.status(status).json({
      success: false,
      error:
        status === 404
          ? 'El archivo generado ya no está disponible. Intenta la descarga de nuevo.'
          : 'No se pudo enviar el archivo generado'
    });
  };

  try {
    res.download(filePath, safeName, (error) => {
      cleanup();
      handleError(error);
    });
  } catch (error) {
    cleanup();
    handleError(error);
  }
}

module.exports = {
  MIME_BY_EXTENSION,
  buildDownloadHeaders,
  sendGeneratedFile
};
