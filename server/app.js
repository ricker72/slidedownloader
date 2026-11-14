const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const { downloadPresentation, normalizeSlideShareUrl, SUPPORTED_FORMATS, extractPresentationInfoLite, extractPresentationInfoViaRenderer, selectSlideImages, cleanSlideTitle, applyImageQuality } = require('../services/slideshareService');
const { buildPresentationPrompt, buildAnalysis } = require('../services/promptService');
const { searchPresentations, buildGoogleUrl, normalizeTopic } = require('../services/presentationSearch');

const app = express();
const PORT = process.env.PORT || 8080;

// En Vercel el sistema de archivos es de solo lectura excepto /tmp.
// En local usamos la carpeta del proyecto.
const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Resolver public/ de forma robusta (local y Vercel serverless)
const candidatePublicDirs = [
  path.join(__dirname, '..', 'public'),
  path.join(process.cwd(), 'public'),
  path.join(__dirname, 'public'),
];
let publicDir = candidatePublicDirs.find((d) => {
  try { return fs.existsSync(path.join(d, 'index.html')); } catch { return false; }
}) || candidatePublicDirs[0];

const downloadsDir = isVercel
  ? path.join('/tmp', 'slidedownloader-downloads')
  : path.join(__dirname, '..', 'downloads');

if (!fs.existsSync(downloadsDir)) {
  try {
    fs.mkdirSync(downloadsDir, { recursive: true });
  } catch (err) {
    console.warn('No se pudo crear downloadsDir:', err.message);
  }
}

console.log('[SlideDownloader] publicDir =', publicDir, '| exists =', fs.existsSync(publicDir));
console.log('[SlideDownloader] downloadsDir =', downloadsDir);
console.log('[SlideDownloader] isVercel =', isVercel);

const DOWNLOAD_MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppsx': 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  '.potx': 'application/vnd.openxmlformats-officedocument.presentationml.template',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

// Archivos que el buscador puede descargar a través del proxy.
const DIRECT_FILE_MIME_TYPES = {
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.pdf': 'application/pdf'
};

const DOWNLOAD_PROXY_MAX_BYTES = 40 * 1024 * 1024;
const DOWNLOAD_PROXY_TIMEOUT = 25 * 1000;
const DOWNLOAD_PROXY_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  accept: 'application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,*/*;q=0.8',
  'accept-language': 'es-MX,es;q=0.9'
};

function isPrivateHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');

  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }

  return host === '::1' || /^f[cd][0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host);
}

function parseDirectFileUrl(raw) {
  let parsed;

  try {
    parsed = new URL(String(raw || ''));
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (isPrivateHostname(parsed.hostname)) return null;

  const extension = path.extname(parsed.pathname).toLowerCase();
  if (!DIRECT_FILE_MIME_TYPES[extension]) return null;

  return { url: parsed.href, extension, mime: DIRECT_FILE_MIME_TYPES[extension] };
}

function buildProxyFileName(fileUrl, extension) {
  let name = '';

  try {
    name = decodeURIComponent(new URL(fileUrl).pathname.split('/').pop() || '');
  } catch {
    name = '';
  }

  name = name
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  if (!new RegExp(`\\${extension}$`, 'i').test(name)) {
    name = `presentacion${extension}`;
  }

  return name || `presentacion${extension}`;
}

function sendDownloadError(res, message, sourceUrl = '') {
  const safeMessage = String(message || 'No se pudo descargar el archivo')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const safeUrl = String(sourceUrl || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return res.status(502).type('html').send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>No se pudo descargar</title>
<style>body{font-family:Segoe UI,system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}
main{max-width:460px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;box-shadow:0 18px 50px -30px rgba(15,23,42,.4)}
h1{font-size:20px;margin:0 0 8px}p{color:#64748b;line-height:1.6;margin:0 0 18px}
a{display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;border-radius:10px;text-decoration:none;font-weight:600}small{display:block;margin-top:14px;color:#94a3b8;word-break:break-all}</style>
</head><body><main><h1>No se pudo descargar automáticamente</h1>
<p>${safeMessage}. Puedes abrir el archivo original y guardarlo desde tu navegador.</p>
${safeUrl ? `<a href="${safeUrl}" rel="noopener">Abrir archivo original</a><small>${safeUrl}</small>` : ''}
</main></body></html>`);
}


// La detección tarda varios segundos (renderizador). Guardar el resultado unos
// minutos permite descargar sin repetirla, incluso si la vista previa aún no
// había terminado en el navegador.
const INSPECT_CACHE_TTL = 10 * 60 * 1000;
const INSPECT_CACHE_LIMIT = 50;
const inspectCache = new Map();

function getCachedInspection(slideUrl) {
  const entry = inspectCache.get(slideUrl);

  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    inspectCache.delete(slideUrl);
    return null;
  }

  return entry.payload;
}

function cacheInspection(slideUrl, payload) {
  if (inspectCache.size >= INSPECT_CACHE_LIMIT) {
    inspectCache.delete(inspectCache.keys().next().value);
  }

  inspectCache.set(slideUrl, {
    payload,
    expiresAt: Date.now() + INSPECT_CACHE_TTL
  });
}

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(publicDir, {
  maxAge: '1h',
  etag: true,
  index: false,
  setHeaders: (res, filePath) => {
    // El HTML se revalida siempre; los assets siguen con caché de 1 hora.
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.get('/', (req, res) => {
  // El HTML debe revalidarse: así un despliegue nuevo se ve al instante.
  res.set('Cache-Control', 'no-cache, must-revalidate');
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/ai', (req, res) => {
  res.set('Cache-Control', 'no-cache, must-revalidate');
  res.sendFile(path.join(publicDir, 'ai.html'));
});

app.get('/google', (req, res) => {
  res.set('Cache-Control', 'no-cache, must-revalidate');
  res.sendFile(path.join(publicDir, 'google.html'));
});

app.get('/preview', (req, res) => {
  res.set('Cache-Control', 'no-cache, must-revalidate');
  res.sendFile(path.join(publicDir, 'preview.html'));
});

app.get('/filtro', (req, res) => {
  res.set('Cache-Control', 'no-cache, must-revalidate');
  res.sendFile(path.join(publicDir, 'google.html'));
});

app.get('/api/search', async (req, res) => {
  const topic = normalizeTopic(req.query.q || req.query.tema || '');
  const formats = req.query.formats || req.query.formato || '';

  res.set('Cache-Control', 'no-store');

  try {
    const payload = await searchPresentations({ topic, formats });
    return res.json({ success: true, ...payload });
  } catch (error) {
    const status = error.status || 500;

    if (status >= 500) {
      console.warn('Error en /api/search:', error.message);
    }

    return res.status(status).json({
      success: false,
      error: error.message || 'No se pudo completar la búsqueda',
      googleUrl: buildGoogleUrl(topic, error.formats),
      failures: Array.isArray(error.failures) ? error.failures.slice(0, 5) : null
    });
  }
});

app.get('/api/file', async (req, res) => {
  const target = parseDirectFileUrl(req.query.url);

  if (!target) {
    return res.status(400).json({
      success: false,
      error: 'Solo se pueden descargar archivos .ppt, .pptx o .pdf públicos'
    });
  }

  const fileName = buildProxyFileName(target.url, target.extension);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_PROXY_TIMEOUT);

  try {
    const upstream = await fetch(target.url, {
      headers: DOWNLOAD_PROXY_HEADERS,
      redirect: 'follow',
      signal: controller.signal
    });

    if (!upstream.ok) {
      clearTimeout(timer);
      return sendDownloadError(res, `El servidor del archivo respondió ${upstream.status}`, target.url);
    }

    const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      clearTimeout(timer);
      return sendDownloadError(res, 'El enlace abrió una página en lugar del archivo', target.url);
    }

    const contentLength = Number(upstream.headers.get('content-length') || 0);
    if (contentLength > DOWNLOAD_PROXY_MAX_BYTES) {
      clearTimeout(timer);
      return res.redirect(302, target.url);
    }

    res.status(200);
    res.setHeader('Content-Type', target.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName).replace(/'/g, '%27')}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (contentLength) {
      res.setHeader('Content-Length', String(contentLength));
    }

    if (req.method === 'HEAD' || !upstream.body) {
      clearTimeout(timer);
      return res.end();
    }

    const stream = Readable.fromWeb(upstream.body);

    stream.on('error', (error) => {
      console.warn('Error al transmitir descarga:', error.message);
      if (!res.headersSent) {
        sendDownloadError(res, 'La descarga se interrumpió', target.url);
      } else {
        res.destroy(error);
      }
    });

    res.on('close', () => {
      clearTimeout(timer);
      controller.abort();
      stream.destroy();
    });

    stream.pipe(res);
    return undefined;
  } catch (error) {
    clearTimeout(timer);

    if (res.headersSent) {
      return res.destroy(error);
    }

    const message = error.name === 'AbortError'
      ? 'El servidor del archivo tardó demasiado en responder'
      : 'No se pudo conectar con el servidor del archivo';

    return sendDownloadError(res, message, target.url);
  }
});


app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/ping', async (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/inspect', async (req, res) => {
  try {
    const { url } = req.body || {};
    const slideUrl = normalizeSlideShareUrl(url);

    if (!slideUrl) {
      return res.status(400).json({ success: false, error: 'URL inválida de SlideShare' });
    }

    const cachedInspection = getCachedInspection(slideUrl);
    if (cachedInspection) {
      return res.json({ ...cachedInspection, cached: true });
    }

    let info = null;
    let method = 'lite';
    let fallbackUsed = false;
    const rendererConfigured = Boolean(process.env.RENDERER_URL);

    // Intento 1: renderizador externo (siempre intentar primero si está configurado,
    // porque es el único que hace scroll y obtiene TODAS las imágenes)
    if (rendererConfigured) {
      try {
        info = await extractPresentationInfoViaRenderer(slideUrl);
        method = 'renderer';
        fallbackUsed = false;
      } catch (rendererError) {
        console.warn('Renderizador externo falló:', rendererError.message);
        info = null;
      }
    }

    // Intento 2: fetch directo (solo como fallback si el renderizador no está configurado o falló)
    if (!info) {
      try {
        info = await extractPresentationInfoLite(slideUrl);
        method = 'lite';
      } catch (error) {
        console.warn('Fetch directo falló:', error.message);
      }
    }

    if (!info) {
      return res.status(500).json({
        success: false,
        error: 'No se pudo inspeccionar la presentación. Intenta nuevamente o configura un servidor de renderizado externo.'
      });
    }

    // Solo diapositivas de esta presentación, en orden y sin duplicados.
    const slideImages = selectSlideImages(info.imageUrls);

    // La vista previa usa la variante de 638 px (más nítida que el thumbnail
    // de 320); el frontend reintenta con 320 si esa variante no existe.
    const previewImages = slideImages.map((url) => applyImageQuality(url, 'sd'));

    // Si no hay imágenes y no hay renderizador, sugerir entrada manual
    const hasImages = slideImages.length > 0;
    const needsManualEntry = (!hasImages && !rendererConfigured);

    const payload = {
      success: true,
      url: slideUrl,
      title: cleanSlideTitle(info.title) || info.title,
      description: info.description || '',
      author: info.author || '',
      slideCount: slideImages.length,
      previewImages,
      galleryImages: previewImages,
      previewQuality: 'hd',
      challengeDetected: info.challengeDetected || false,
      method,
      fallbackUsed,
      needsManualEntry
    };

    if (hasImages) {
      cacheInspection(slideUrl, payload);
    }

    return res.json(payload);
  } catch (error) {
    console.error('Error en /api/inspect:', error);
    return res.status(500).json({ success: false, error: error.message || 'Error al inspeccionar la presentación' });
  }
});

app.post('/api/prompt', async (req, res) => {
  try {
    const { url, analysis, options } = req.body || {};
    const normalizedUrl = url || analysis?.url || '';
    const slideUrl = normalizedUrl ? normalizeSlideShareUrl(normalizedUrl) : '';

    if (normalizedUrl && !slideUrl) {
      return res.status(400).json({ success: false, error: 'URL inválida de SlideShare' });
    }

    const analysisInput = {
      ...(analysis || {}),
      url: slideUrl || normalizedUrl || ''
    };

    if (!analysisInput.title && !slideUrl) {
      return res.status(400).json({ success: false, error: 'Se requiere una URL de SlideShare o el título analizado' });
    }

    // Si la interfaz solo envía la URL, el servidor completa el análisis.
    if (!analysisInput.title && slideUrl) {
      let info = null;
      const rendererConfigured = Boolean(process.env.RENDERER_URL);

      // El renderizador obtiene todas las diapositivas y metadatos fiables.
      if (rendererConfigured) {
        try {
          info = await extractPresentationInfoViaRenderer(slideUrl);
        } catch (rendererError) {
          console.warn('Renderizador externo falló en /api/prompt:', rendererError.message);
        }
      }

      if (!info) {
        try {
          info = await extractPresentationInfoLite(slideUrl);
        } catch (error) {
          console.warn('Fetch directo falló en /api/prompt:', error.message);
        }
      }

      if (info) {
        analysisInput.title = info.title;
        analysisInput.description = info.description;
        analysisInput.author = info.author;
        analysisInput.slideCount = selectSlideImages(info.imageUrls).length;
      }
    }

    const prompt = buildPresentationPrompt({ analysis: analysisInput, options: options || {} });
    const result = buildAnalysis(analysisInput);

    return res.json({
      success: true,
      prompt,
      analysis: result,
      characterCount: prompt.length
    });
  } catch (error) {
    const status = error.status || 500;

    if (status >= 500) {
      console.error('Error en /api/prompt:', error);
    }

    return res.status(status).json({
      success: false,
      error: error.message || 'No se pudo generar el prompt'
    });
  }
});

app.post('/api/download', async (req, res) => {
  try {
    const { url, format, quality, imageUrls, title } = req.body || {};

    if (!url) {
      return res.status(400).json({ success: false, error: 'Se requiere una URL' });
    }

    const normalizedUrl = normalizeSlideShareUrl(url);
    if (!normalizedUrl) {
      return res.status(400).json({ success: false, error: 'URL inválida de SlideShare' });
    }

    const selectedFormat = String(format || 'pdf').toLowerCase();
    if (!SUPPORTED_FORMATS.includes(selectedFormat)) {
      return res.status(400).json({
        success: false,
        error: `Formato no soportado. Formatos disponibles: ${SUPPORTED_FORMATS.join(', ')}`
      });
    }

    const selectedQuality = String(quality || 'sd').toLowerCase();
    if (!['sd', 'hd'].includes(selectedQuality)) {
      return res.status(400).json({ success: false, error: 'Calidad no soportada. Opciones: sd, hd' });
    }

    const cachedInspection = getCachedInspection(normalizedUrl);
    const result = await downloadPresentation(normalizedUrl, selectedFormat, selectedQuality, {
      imageUrls: Array.isArray(imageUrls) && imageUrls.length ? imageUrls : cachedInspection?.previewImages,
      title: title || cachedInspection?.title
    });
    return res.json({
      success: true,
      title: result.title,
      format: result.format,
      quality: result.quality,
      source: result.source,
      slideCount: result.imageCount,
      downloadUrl: result.downloadUrl,
      fileName: result.fileName,
      message: 'Archivo generado correctamente'
    });
  } catch (error) {
    const status = error.status || 500;

    // Los errores 4xx son peticiones inválidas; solo se registran los 5xx.
    if (status >= 500) {
      console.error('Error en /api/download:', error);
    }

    return res.status(status).json({
      success: false,
      error: error.message || 'Error al generar la descarga'
    });
  }
});

app.get('/download/:jobId/:filename', (req, res) => {
  const { jobId, filename } = req.params;
  const root = path.resolve(downloadsDir);
  const filePath = path.resolve(root, jobId, filename);
  const safeName = path.basename(filename);

  // Impedir que jobId o filename permitan salir del directorio de descargas.
  if (!safeName || !filePath.startsWith(root + path.sep)) {
    return res.status(400).json({ success: false, error: 'Ruta de archivo no válida' });
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
  }

  const extension = path.extname(safeName).toLowerCase();
  res.setHeader('Content-Type', DOWNLOAD_MIME_TYPES[extension] || 'application/octet-stream');

  return res.download(filePath, safeName);
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'Endpoint no encontrado' });
  }

  return res.status(404).send('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>404</title></head><body><h1>404 - Página no encontrada</h1></body></html>');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  });
}

module.exports = app;
