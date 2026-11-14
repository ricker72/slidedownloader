const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Directorio donde se guardan los archivos generados.
const downloadsDir = path.join(__dirname, '..', 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

const SUPPORTED_FORMATS = ['pptx', 'pdf', 'docx'];
const ALLOWED_HOSTS = ['slideshare.net', 'www.slideshare.net', 'm.slideshare.net'];
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_REDIRECTS = 5;

/**
 * Error con código y estado HTTP para que la API responda de forma consistente.
 */
class DownloaderError extends Error {
  constructor(message, code = 'DOWNLOADER_ERROR', status = 500) {
    super(message);
    this.name = 'DownloaderError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Validar y normalizar una URL de SlideShare.
 * @param {string} url - URL a validar
 * @returns {string|null} - URL normalizada o null si es inválida
 */
function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Permitir URLs con o sin protocolo
  let normalized = url.trim();
  if (!normalized) {
    return null;
  }
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = 'https://' + normalized;
  }

  try {
    const urlObj = new URL(normalized);

    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return null;
    }

    // Solo permitir dominios de SlideShare
    if (!ALLOWED_HOSTS.includes(urlObj.hostname.toLowerCase())) {
      return null;
    }

    // Eliminar parámetros de descarga irrelevantes
    for (const param of ['download', 'downloadfile', 'format']) {
      urlObj.searchParams.delete(param);
    }

    return urlObj.toString();
  } catch (error) {
    console.error('Error validando URL:', error.message);
    return null;
  }
}

/**
 * Hacer una única petición HTTP(S).
 * @returns {Promise<{ redirect: string } | { content: Buffer, size: number, statusCode: number, headers: object }>}
 */
function requestOnce(url, options = {}) {
  return new Promise((resolve, reject) => {
    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (error) {
      return reject(new DownloaderError(`URL inválida: ${url}`, 'INVALID_URL', 400));
    }

    const lib = urlObj.protocol === 'https:' ? https : http;

    const request = lib.get(
      urlObj,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
          Connection: 'keep-alive',
          ...options.headers,
        },
        timeout: options.timeout || 30000,
      },
      (response) => {
        const redirectCodes = [301, 302, 303, 307, 308];
        if (redirectCodes.includes(response.statusCode) && response.headers.location) {
          response.resume();
          return resolve({ redirect: response.headers.location });
        }

        if (response.statusCode >= 400) {
          response.resume();
          return reject(
            new DownloaderError(`HTTP ${response.statusCode}: ${url}`, 'HTTP_ERROR', 502)
          );
        }

        const chunks = [];
        let totalSize = 0;

        response.on('data', (chunk) => {
          chunks.push(chunk);
          totalSize += chunk.length;
        });

        response.on('end', () => {
          resolve({
            content: Buffer.concat(chunks),
            size: totalSize,
            statusCode: response.statusCode,
            headers: response.headers,
          });
        });

        response.on('error', reject);
      }
    );

    request.on('timeout', () => {
      request.destroy(new DownloaderError('Tiempo de espera agotado al descargar', 'TIMEOUT', 504));
    });

    request.on('error', (error) => {
      reject(
        error instanceof DownloaderError
          ? error
          : new DownloaderError(`No se pudo conectar: ${error.message}`, 'NETWORK_ERROR', 502)
      );
    });
  });
}

/**
 * Descargar contenido de una URL siguiendo redirecciones.
 * @param {string} url - URL a descargar
 * @param {Object} options - Opciones de descarga
 * @returns {Promise<Object>} - Contenido descargado
 */
async function downloadContent(url, options = {}) {
  let currentUrl = url;

  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt++) {
    const result = await requestOnce(currentUrl, options);
    if (result.redirect) {
      currentUrl = new URL(result.redirect, currentUrl).toString();
      continue;
    }
    return result;
  }

  throw new DownloaderError('Demasiadas redirecciones', 'TOO_MANY_REDIRECTS', 502);
}

/**
 * Extraer metadatos de la presentación.
 * @param {string} url - URL de la presentación
 * @returns {Promise<Object>} - Metadatos
 */
async function extractMetadata(url) {
  const response = await downloadContent(url);
  const html = response.content.toString('utf-8');

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const rawTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';

  return {
    title: extractTitle(url, rawTitle),
    url,
    contentLength: response.size,
    statusCode: response.statusCode,
    downloadDate: new Date().toISOString(),
  };
}

/**
 * Extraer el título de la presentación desde la URL o el HTML.
 * @param {string} url - URL de la presentación
 * @param {string} defaultTitle - Título obtenido del HTML
 * @returns {string} - Título limpio
 */
function extractTitle(url, defaultTitle) {
  try {
    const cleaned = (defaultTitle || '')
      .replace(/[<>"']/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);

    if (cleaned) {
      return cleaned;
    }

    // Intentar extraer de la URL: /slideshow/<titulo>-<id>/<id>
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const slideshowIndex = pathParts.indexOf('slideshow');

    if (slideshowIndex !== -1 && slideshowIndex + 1 < pathParts.length) {
      return pathParts[slideshowIndex + 1]
        .replace(/-\d+$/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
    }

    return pathParts[pathParts.length - 1] || 'presentacion';
  } catch (error) {
    return 'presentacion';
  }
}

/**
 * Generar un nombre de archivo limpio y seguro.
 * @param {string} title - Título de la presentación
 * @param {string} format - Formato de destino
 * @returns {string} - Nombre de archivo
 */
function getFileName(title, format) {
  const safeFormat = String(format || 'pptx')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const safeTitle = String(title || '')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 100);

  return `${safeTitle || 'presentacion'}.${SUPPORTED_FORMATS.includes(safeFormat) ? safeFormat : 'pptx'}`;
}

/**
 * Procesar una descarga delegando en el servicio de SlideShare.
 *
 * @param {string} slideUrl - URL de la presentación
 * @param {string} format - Formato de salida
 * @returns {Promise<Object>} - Resultado de la descarga
 */
async function download(slideUrl, format) {
  const normalizedFormat = String(format || '').toLowerCase();

  if (!SUPPORTED_FORMATS.includes(normalizedFormat)) {
    throw new DownloaderError(
      `Formato no soportado. Formatos disponibles: ${SUPPORTED_FORMATS.join(', ')}`,
      'UNSUPPORTED_FORMAT',
      400
    );
  }

  // Carga diferida: el servicio arrastra navegador y librerías de conversión.
  const { downloadPresentation } = require('../services/slideshareService');
  const result = await downloadPresentation(slideUrl, normalizedFormat);

  return {
    filename: result.fileName,
    fileType: normalizedFormat,
    jobId: result.jobId,
    title: result.title,
    imageCount: result.imageCount,
    downloadUrl: result.downloadUrl,
  };
}

module.exports = {
  DownloaderError,
  SUPPORTED_FORMATS,
  downloadsDir,
  validateUrl,
  extractTitle,
  getFileName,
  download,
  downloadContent,
  extractMetadata,
};
