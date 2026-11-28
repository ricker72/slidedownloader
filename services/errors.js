/**
 * Catálogo único de errores de servicio.
 *
 * Los códigos se propagan en `.code` y en la cabecera `X-Error-Code`, pero el
 * cuerpo JSON de la API sigue siendo exactamente `{success:false,error}` para
 * no romper contratos ya publicados.
 */

const ERROR_CODES = Object.freeze({
  INVALID_URL: 'INVALID_URL',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  UNSUPPORTED_QUALITY: 'UNSUPPORTED_QUALITY',
  DOWNLOAD_VALIDATION: 'DOWNLOAD_VALIDATION',
  IMAGE_TOO_LARGE: 'IMAGE_TOO_LARGE',
  DECK_TOO_LARGE: 'DECK_TOO_LARGE',
  DECK_TIMEOUT: 'DECK_TIMEOUT',
  INSPECTION_FAILED: 'INSPECTION_FAILED',
  NO_IMAGES: 'NO_IMAGES',
  RENDERER_UNAVAILABLE: 'RENDERER_UNAVAILABLE'
});

const CATALOG_CODES = new Set(Object.values(ERROR_CODES));

/** Solo los códigos del catálogo se exponen al cliente (nunca ENOENT, etc.). */
function isCatalogCode(code) {
  return CATALOG_CODES.has(code);
}

/**
 * @param {string} message
 * @param {number} status
 * @param {string} [code]
 * @returns {Error & {status: number, code?: string}}
 */
function createServiceError(message, status, code) {
  const error = /** @type {Error & {status: number, code?: string}} */ (new Error(message));
  error.status = status;
  if (code) error.code = code;
  return error;
}

class DownloadValidationError extends Error {
  /**
   * @param {string} message
   * @param {number} [status]
   * @param {string} [code]
   */
  constructor(message, status = 400, code = ERROR_CODES.DOWNLOAD_VALIDATION) {
    super(message);
    this.name = 'DownloadValidationError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Traduce un error a los datos públicos de la respuesta. No muta el error.
 *
 * `maskServerErrors` se usa en las rutas que ya ocultaban detalles internos en
 * producción. Las rutas que históricamente exponían `error.message` pasan el
 * valor explícito `false` para preservar ese comportamiento.
 */
function toPublicError(error, options = {}) {
  const {
    isProduction = false,
    fallbackMessage = 'Error interno del servidor',
    maskedMessage = 'Error interno del servidor',
    maskServerErrors = isProduction,
    forceStatus
  } = options;

  const status = Number(forceStatus) || Number(error && error.status) || 500;
  const isServerError = status >= 500;
  const message = isServerError && maskServerErrors
    ? maskedMessage
    : (error && error.message) || fallbackMessage;

  const code = (error && error.code) || null;

  return {
    status,
    message,
    code: isCatalogCode(code) ? code : null
  };
}

module.exports = {
  ERROR_CODES,
  isCatalogCode,
  createServiceError,
  DownloadValidationError,
  toPublicError
};
