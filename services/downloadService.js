/**
 * Validación y generación de descargas, compartidas por el endpoint
 * sincrónico y (si se habilita) por el worker de trabajos en background.
 *
 * No envía archivos ni escribe respuestas HTTP: solo valida la petición y
 * delega en `downloadPresentation`. Así el contrato de `/api/download`
 * sigue siendo exactamente el mismo que antes de extraer esta lógica.
 */

const {
  downloadPresentation,
  normalizeSlideShareUrl,
  SUPPORTED_FORMATS
} = require('./slideshareService');
const { ERROR_CODES, DownloadValidationError } = require('./errors');

const DOWNLOAD_QUALITIES = ['sd', 'hd'];

/**
 * Cuerpo admitido por `/api/download` (y por el worker en segundo plano).
 * @typedef {object} DownloadRequest
 * @property {string} [url] - Enlace de SlideShare.
 * @property {string} [format] - pdf, pptx, ppsx, potx, docx, txt o md.
 * @property {string} [quality] - sd o hd.
 * @property {string[]} [imageUrls] - Diapositivas devueltas por `/api/inspect`.
 * @property {string} [title] - Título detectado por la vista previa.
 * @property {string} [progressId] - UUID para sondear `/api/progress/:id`.
 */

/**
 * Valida y normaliza el cuerpo de una petición de descarga.
 * Lanza `DownloadValidationError` con los mismos mensajes y códigos que
 * usaba anteriormente el controlador de `/api/download`.
 *
 * @param {DownloadRequest} [body]
 * @returns {DownloadRequest}
 */
function validateDownloadRequest(body) {
  const { url, format, quality, imageUrls, title } = body || {};

  if (!url) {
    throw new DownloadValidationError('Se requiere una URL', 400, ERROR_CODES.INVALID_URL);
  }

  const normalizedUrl = normalizeSlideShareUrl(url);
  if (!normalizedUrl) {
    throw new DownloadValidationError('URL inválida de SlideShare', 400, ERROR_CODES.INVALID_URL);
  }

  const selectedFormat = String(format || 'pdf').toLowerCase();
  if (!SUPPORTED_FORMATS.includes(selectedFormat)) {
    throw new DownloadValidationError(
      `Formato no soportado. Formatos disponibles: ${SUPPORTED_FORMATS.join(', ')}`,
      400,
      ERROR_CODES.UNSUPPORTED_FORMAT
    );
  }

  const selectedQuality = String(quality || 'sd').toLowerCase();
  if (!DOWNLOAD_QUALITIES.includes(selectedQuality)) {
    throw new DownloadValidationError('Calidad no soportada. Opciones: sd, hd', 400, ERROR_CODES.UNSUPPORTED_QUALITY);
  }

  return {
    url: normalizedUrl,
    format: selectedFormat,
    quality: selectedQuality,
    imageUrls,
    title
  };
}

/**
 * Genera el archivo de la presentación.
 *
 * `options.getCachedInspection` permite reutilizar la vista previa ya
 * calculada por `/api/inspect`. El worker de background no la tiene y usa
 * un getter por defecto que devuelve `null`.
 */
async function generateDownload(body, options = {}) {
  const request = validateDownloadRequest(body);
  const getCachedInspection = options.getCachedInspection || (() => null);
  const generate = options.generate || downloadPresentation;

  const cachedInspection = getCachedInspection(request.url) || null;
  const generateOptions = {
    imageUrls: Array.isArray(request.imageUrls) && request.imageUrls.length
      ? request.imageUrls
      : cachedInspection?.previewImages,
    title: request.title || cachedInspection?.title
  };

  // Solo se añade cuando existe para conservar la forma histórica de `options`.
  if (typeof options.onProgress === 'function') {
    generateOptions.onProgress = options.onProgress;
  }

  return generate(request.url, request.format, request.quality, generateOptions);
}

module.exports = {
  DownloadValidationError,
  DOWNLOAD_QUALITIES,
  validateDownloadRequest,
  generateDownload
};
