const fs = require('fs');
const path = require('path');

// Crear directorio de descargas si no existe
const downloadsDir = path.join(__dirname, '..', 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

/**
 * Validar y normalizar URL de SlideShare
 * @param {string} url - URL a validar
 * @returns {string|null} - URL normalizada o null si es inválida
 */
function validateUrl(url) {
  try {
    if (!url || typeof url !== 'string') {
      return null;
    }

    // Permitir URLs con o sin protocolo
    let normalized = url.trim();
    
    // Añadir protocolo si no hay
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    
    // Verificar que sea una URL válida
    const urlObj = new URL(normalized);
    
    // Solo permitir dominios de SlideShare
    const allowedDomains = ['slideshare.net', 'www.slideshare.net'];
    if (!allowedDomains.includes(urlObj.hostname)) {
      return null;

/**
 * Descargar contenido de una URL
 * @param {string} url - URL a descargar
 * @param {Object} options - Opciones de descarga
 * @returns {Promise<Buffer>} - Contenido descargado
 */
async function downloadContent(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http');
    const urlObj = new URL(url);
    
    const optionsHttp = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        ...options.headers
      },
      timeout: options.timeout || 60000
    };
    
    const request = lib.get(urlObj, optionsHttp, (response) => {
      if (response.statusCode >= 400) {
        return reject(new Error(`HTTP ${response.statusCode}: ${url}`));
      }
      
      const chunks = [];
      let totalSize = 0;
      
      response.on('data', (chunk) => {
        chunks.push(chunk);
        totalSize += chunk.length;
      });
      
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          content: buffer,
          size: totalSize,
          statusCode: response.statusCode,
          headers: response.headers
        });
      });
      
      response.on('error', reject);
    });
    
    request.on('timeout', () => {
      request.destroy(new Error('Timeout de descarga'));
    });
    
    request.on('error', reject);
  });
}

/**
 * Extraer metadatos de la presentación
 * @param {string} url - URL de la presentación
 * @returns {Promise<Object>} - Metadatos
 */
async function extractMetadata(url) {
  try {
    const content = await downloadContent(url);
    const html = content.content.toString('utf-8');
    
    // Extraer título
    let title = 'presentacion';
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(/[\n\r]/g, ' ').trim();
    }
    
    // Extraer metadatos adicionales
    const metadata = {
      title: title,
      url: url,
      contentLength: content.size,
      statusCode: content.statusCode,
      downloadDate: new Date().toISOString(),
      format: 'pptx'
    };
    
    return metadata;
    
  } catch (error) {
    console.error('Error extrayendo metadatos:', error);
    return {
      title: 'presentacion',
      url: url,
      contentLength: 0,
      statusCode: 0,
      downloadDate: new Date().toISOString(),
      format: 'pptx'
    };
  }
}

/**
 * Procesar descarga completa
 * @param {string} slideUrl - URL de la presentación
 * @param {string} format - Formato de salida
 * @returns {Promise<Object>} - Resultado de la descarga
 */
async function download(slideUrl, format) {
  try {
    // Extraer metadatos
    const metadata = await extractMetadata(slideUrl);
    
    // Generar nombre de archivo
    const filename = getFileName(metadata.title, format);
    const filePath = path.join(downloadsDir, filename);
    
    // Aquí se implementaría la lógica de descarga real
    // usando Puppeteer o otras herramientas
    // Por ahora, devolvemos un objeto placeholder
    return {
      success: true,
      filename: filename,
      fileType: format,
      fileSize: 0,
      url: slideUrl,
      metadata: metadata,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error en descarga:', error);
    throw error;
  }
}

module.exports = {
  validateUrl,
  extractTitle,
  getFileName,
  download,
  downloadContent,
  downloadsDir
};
    }
    
    // Eliminar cadenas de parámetros irrelevantes
    const searchParams = urlObj.searchParams;
    searchParams.delete('download');
    searchParams.delete('downloadfile');
    searchParams.delete('format');
    
    urlObj.search = searchParams.toString();
    
    return urlObj.toString();
    
  } catch (error) {
    console.error('Error validando URL:', error);
    return null;
  }
}

/**
 * Extraer el título de la presentación del URL o contenido
 * @param {string} url - URL de la presentación
 * @param {string} defaultTitle - Título por defecto
 * @returns {string} - Título limpio
 */
function extractTitle(url, defaultTitle) {
  try {
    if (!defaultTitle) {
      // Intentar extraer de la URL
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      
      if (pathParts.length >= 3) {
        // Buscar título entre /slideshow/ y / numero
        const slideshowIndex = pathParts.indexOf('slideshow');
        if (slideshowIndex !== -1 && slideshowIndex + 1 < pathParts.length) {
          return pathParts[slideshowIndex + 1]
            .replace(/-/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
        }
      }
      
      // Usar el último segmento del path
      return pathParts[pathParts.length - 1] || 'presentacion';
    }
    
    // Limpiar el título
    return defaultTitle
      .replace(/[<>"']/g, '')
      .substring(0, 100)
      .trim() || 'presentacion';
    
  } catch (error) {
    return defaultTitle || 'presentacion';
  }
}

/**
 * Generar nombre de archivo limpio
 * @param {string} title - Título de la presentación
 * @param {string} format - Formato de destino
 * @returns {string} - Nombre de archivo
 */
function getFileName(title, format) {
  const safeTitle = title.replace(/[^a-zA-Z0-9\u00C0-\u017F\s]/g, '').trim();
  const safeTitleClean = safeTitle.replace(/\s+/g, '_');
  return `${safeTitleClean || 'presentacion'}.${format}`;
}

module.exports = {
  validateUrl,
  extractTitle,
  getFileName
};