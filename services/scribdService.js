/**
 * Servicio para buscar y descargar documentos de Scribd.es
 * 
 * Nota: Scribd requiere autenticación y suscripción para descargar documentos.
 * Este servicio está diseñado para:
 * - Buscar documentos públicos disponibles
 * - Verificar si un documento es descargable
 * - Extraer metadatos de documentos de Scribd
 * 
 * LIMITACIONES:
 * - Scribd requiere cuenta iniciada sesión para descargar
 * - Los documentos protegidos por derechos deautor no pueden ser distribuidos
 * - Este servicio solo funciona con documentos públicos o los que el usuario tenga derecho a descargar
 */

const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Headers por defecto para simular un navegador real
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

// Buscar un documento en Scribd por palabra clave
function searchDocuments(query, callback) {
  const parsedUrl = url.parse('https://es.scribd.com/search');
  const options = {
    hostname: 'es.scribd.com',
    path: '/search?' + new URLSearchParams({ q: query, view: 'all' }),
    method: 'GET',
    headers: DEFAULT_HEADERS
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      callback(null, data);
    });
  });

  req.on('error', (err) => {
    callback(err, null);
  });
  req.end();
}

// Obtener información de un documento específico por su URL
function getDocumentInfo(scribdUrl, callback) {
  // Normalizar URL de Scribd
  let normalizedUrl = scribdUrl;
  if (!normalizedUrl.startsWith('https://')) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  const parsedUrl = url.parse(normalizedUrl);
  const options = {
    hostname: 'es.scribd.com',
    path: parsedUrl.pathname + (parsedUrl.search || ''),
    method: 'GET',
    headers: DEFAULT_HEADERS
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      // Extraer información clave de la página
      const info = {
        url: normalizedUrl,
        title: null,
        description: null,
        isDownloadable: false,
        fileType: null,
        requiresSubscription: false,
        error: null
      };

      // Buscar título en la página
      const titleMatch = data.match(/<title[^>]*>([^<]*)<\/title>/i);
      if (titleMatch) {
        info.title = titleMatch[1].trim();
      }

      // Detectar si requiere suscripción
      if (data.match(/require\s*subscription|subscription|membresía|premium/i)) {
        info.requiresSubscription = true;
      }

      // Detectar tipos de archivo
      const extMatches = data.match(/(pdf|docx?|pptx?|xlsx?)/i);
      if (extMatches) {
        info.fileType = extMatches[1].toLowerCase();
      }

      // Detectar botón de descarga (indica que es descargable)
      if (data.match(/botón de descargar|download button|btn-download|descargar/i)) {
        info.isDownloadable = true;
      }

      callback(null, info);
    });
  });

  req.on('error', (err) => {
    callback(err, null);
  });
  req.end();
}

// Intentar descargar un documento de Scribd
// NOTA: Esto requiere autenticación válida de Scribd
function downloadDocument(scribdUrl, outputPath, callback) {
  // Scribd requiere sesión iniciada. Este es un esqueleto.
  // En un implementación completa, necesitaría:
  // 1. Credenciales de sesión de Scribd
  // 2. Manejo de cookies
  // 3. Navegación mediante su visor

  callback(new Error('Descarga de Scribd requiere autenticación de sesión. Scribd restringe el acceso sin cuenta iniciada sesión.'));
}

// Verificar si un documento es público y descargable sin autenticación
function checkPublicDocument(scribdUrl, callback) {
  getDocumentInfo(scribdUrl, (err, info) => {
    if (err) return callback(err, null);

    // Determinar si el documento es accesible públicamente
    const result = {
      url: info.url,
      title: info.title,
      isPublic: !info.requiresSubscription && info.isDownloadable,
      fileType: info.fileType,
      downloadable: info.isDownloadable,
      message: info.requiresSubscription 
        ? 'Requiere suscripción de Scribd para descargar' 
        : 'Documento público - disponible para descargar'
    };

    callback(null, result);
  });
}

module.exports = {
  searchDocuments,
  getDocumentInfo,
  downloadDocument,
  checkPublicDocument
};