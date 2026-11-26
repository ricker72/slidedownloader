const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const { normalizeSlideShareUrl, extractPresentationInfoLite, extractPresentationInfoViaRenderer, selectSlideImages, cleanSlideTitle, applyImageQuality, getLimits } = require('../services/slideshareService');
const {
  buildPresentationPrompt,
  buildAnalysis,
  buildStructuredSummary,
  normalizeSlideTexts
} = require('../services/promptService');
const { getGoogleCseId } = require('../services/presentationSearch');
const {
  apiLimiter,
  inspectLimiter,
  downloadLimiter,
  promptLimiter,
  fileLimiter,
  searchConfigLimiter,
  pingLimiter,
  progressLimiter
} = require('../middleware/rateLimiter');
const { securityHeaders } = require('../middleware/securityHeaders');
const { sendGeneratedFile, MIME_BY_EXTENSION } = require('../utils/fileResponse');
const { isValidJobId, cleanupJobDir } = require('../utils/downloadJob');
const { openPublicResponse, isBlockedHostname } = require('../utils/publicNetwork');
const { generateDownload } = require('../services/downloadService');
const { ProgressTracker } = require('../services/progressTracker');
const { MemoryJobStore } = require('../services/jobStore');
const { MemoryArtifactStore } = require('../services/artifactStore');
const { createJobsRouter } = require('../api/jobs');
const scribdRouter = require('../api/scribd');
const { sendError, errorHandler } = require('../middleware/errorHandler');
const { getRuntime } = require('../config');

const app = express();
const progressTracker = new ProgressTracker();

// Valores de arranque: el puerto, el perfil y el modo worker no cambian en caliente.
const {
  port: PORT,
  isVercel,
  jobsEnabled,
  rendererUrl: configuredRendererUrl,
  rendererSecret: configuredRendererSecret,
  maxJobAttempts
} = getRuntime();
// El worker solo existe en el proceso principal. En Vercel (`api/index.js`
// hace require de esta app) no hay worker ni stores compartidos, así que la
// UI no debe ofrecer el modo asíncrono aunque la variable esté activa.
const jobsRunnable = jobsEnabled && require.main === module;

if (jobsEnabled && !jobsRunnable) {
  console.warn(
    '[SlideDownloader] JOBS_ENABLED=true pero no hay worker en este proceso: '
    + 'los endpoints de jobs permanecen desactivados.'
  );
}

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

if (configuredRendererUrl && !configuredRendererSecret) {
  console.warn(
    '[SlideDownloader] RENDERER_URL está configurada sin RENDERER_SECRET: el renderizador rechazará las peticiones hasta definir el mismo secreto en ambos servicios.'
  );
}

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

function parseDirectFileUrl(raw) {
  let parsed;

  try {
    parsed = new URL(String(raw || ''));
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (parsed.username || parsed.password) return null;
  // Bloquea literales privados y nombres locales; los dominios se validan
  // otra vez al resolver DNS, justo antes de conectar.
  if (isBlockedHostname(parsed.hostname)) return null;

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
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'https:', 'data:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      frameSrc: ['https://docs.google.com', 'https://view.officeapps.live.com'],
      connectSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
// Los tokens de los trabajos viajan en la query string por compatibilidad;
// nunca deben acabar en los logs de acceso.
morgan.token('safe-url', (req) => String(req.originalUrl || '').replace(/([?&]token=)[^&]+/gi, '$1[REDACTED]'));
app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :safe-url" :status :res[content-length] ":referrer" ":user-agent"'));
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

app.use(securityHeaders);

// Rechazar rutas con segmentos ".." antes de que Express las normalice.
// Sin esto, `/download/../../../etc/passwd` se resuelve como un 404 genérico
// y oculta un intento de path traversal.
app.use((req, res, next) => {
  let pathname = req.originalUrl || '';
  const queryIndex = pathname.indexOf('?');
  if (queryIndex !== -1) pathname = pathname.slice(0, queryIndex);

  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return res.status(400).json({ success: false, error: 'Ruta no válida' });
  }

  if (/(?:^|\/)\.\.(?:\/|$)/.test(decoded) || decoded.includes('\0')) {
    return res.status(400).json({ success: false, error: 'Ruta no válida' });
  }

  return next();
});

app.use((req, res, next) => {
  const allowedOrigins = getRuntime().allowedOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const origin = req.headers.origin || '';

  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
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

app.get('/scribd', (req, res) => {
  res.set('Cache-Control', 'no-cache, must-revalidate');
  res.sendFile(path.join(publicDir, 'scribd.html'));
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

app.get('/api/search/config', searchConfigLimiter, (req, res) => {
  res.set('Cache-Control', 'no-store');

  const engineId = getGoogleCseId();
  if (!engineId) {
    return res.status(503).json({
      success: false,
      error: 'La búsqueda de Google no está configurada. Define GOOGLE_CSE_ID en el entorno del servidor.'
    });
  }

  return res.json({ success: true, engineId });
});

app.get('/api/file', fileLimiter, async (req, res) => {
  const target = parseDirectFileUrl(req.query.url);

  if (!target) {
    return res.status(400).json({
      success: false,
      error: 'Solo se pueden descargar archivos .ppt, .pptx o .pdf públicos'
    });
  }

  let opened;

  try {
    // Redirecciones manuales: cada salto se valida (protocolo, host, IP).
    opened = await openPublicResponse(target.url, {
      headers: DOWNLOAD_PROXY_HEADERS,
      timeoutMs: DOWNLOAD_PROXY_TIMEOUT,
      method: req.method === 'HEAD' ? 'HEAD' : 'GET'
    });
  } catch (error) {
    if (res.headersSent) return res.destroy(error);

    if (error.code === 'EBLOCKED') {
      return res.status(400).json({
        success: false,
        error: 'Solo se pueden descargar archivos públicos alojados en Internet'
      });
    }

    if (error.code === 'ETIMEDOUT') {
      return sendDownloadError(res, 'El servidor del archivo tardó demasiado en responder', target.url);
    }

    if (error.status) {
      return sendDownloadError(res, `El servidor del archivo respondió ${error.status}`, target.url);
    }

    return sendDownloadError(res, 'No se pudo conectar con el servidor del archivo', target.url);
  }

  const { response, request } = opened;

  const contentType = String(response.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('text/html')) {
    response.resume();
    request.destroy();
    return sendDownloadError(res, 'El enlace abrió una página en lugar del archivo', target.url);
  }

  const contentLength = Number(response.headers['content-length'] || 0);
  if (contentLength > DOWNLOAD_PROXY_MAX_BYTES) {
    response.resume();
    request.destroy();
    return res.redirect(302, target.url);
  }

  const fileName = buildProxyFileName(target.url, target.extension);

  res.status(200);
  res.setHeader('Content-Type', target.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName).replace(/'/g, '%27')}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (contentLength) {
    res.setHeader('Content-Length', String(contentLength));
  }

  if (req.method === 'HEAD') {
    response.resume();
    request.destroy();
    return res.end();
  }

  let closed = false;
  let timer = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (timer) clearTimeout(timer);
    request.destroy();
    response.destroy();
  };

  // La descarga completa (no solo las cabeceras) tiene su propio límite.
  timer = setTimeout(() => {
    const timeoutError = Object.assign(new Error('Tiempo de espera agotado'), { code: 'ETIMEDOUT' });
    response.destroy(timeoutError);
  }, DOWNLOAD_PROXY_TIMEOUT);

  response.on('error', (error) => {
    if (timer) clearTimeout(timer);
    console.warn('Error al transmitir descarga:', error.message);

    if (res.headersSent) {
      res.destroy(error);
    } else {
      sendDownloadError(res, 'La descarga se interrumpió', target.url);
    }

    cleanup();
  });

  res.on('close', cleanup);
  res.on('finish', () => {
    if (timer) clearTimeout(timer);
  });

  response.pipe(res);
  return undefined;
});


app.get('/api/health', pingLimiter, (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/ping', pingLimiter, async (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Límites vigentes del servidor para que la UI los muestre antes de descargar.
// Se calculan en cada respuesta: una instancia con otra configuración no debe
// heredar los valores cacheados de otra.
function getPublicLimits() {
  return {
    ...getLimits(),
    jobsEnabled: jobsRunnable,
    textFormats: ['txt', 'md'],
    ocrEnabled: getRuntime().ocrEnabled
  };
}

app.get('/api/limits', pingLimiter, (req, res) => {
  res.json({ success: true, ...getPublicLimits() });
});

app.post('/api/inspect', inspectLimiter, async (req, res) => {
  try {
    const { url } = req.body || {};
    const slideUrl = normalizeSlideShareUrl(url);

    if (!slideUrl) {
      return res.status(400).json({ success: false, error: 'URL inválida de SlideShare' });
    }

    const cachedInspection = getCachedInspection(slideUrl);
    if (cachedInspection) {
      return res.json({ ...cachedInspection, cached: true, limits: getPublicLimits() });
    }

    let info = null;
    let method = 'lite';
    let fallbackUsed = false;
    const rendererConfigured = Boolean(getRuntime().rendererUrl);

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

    // Diapositivas candidatas antes de recortar, sin contar miniaturas ni
    // imágenes ajenas: la UI avisa solo si se descartarán diapositivas reales.
    const allSlideImages = selectSlideImages(info.imageUrls, Number.POSITIVE_INFINITY);
    const detectedSlideCount = allSlideImages.length;

    // Solo diapositivas de esta presentación, en orden y sin duplicados.
    const slideImages = allSlideImages.slice(0, getLimits().maxSlides);

    // La vista previa usa la variante de 638 px (más nítida que el thumbnail
    // de 320); el frontend reintenta con 320 si esa variante no existe.
    const previewImages = slideImages.map((url) => applyImageQuality(url, 'sd'));
    const analysis = buildAnalysis({
      title: cleanSlideTitle(info.title) || info.title,
      description: info.description || '',
      author: info.author || '',
      url: slideUrl,
      slideCount: slideImages.length
    });

    // Si no hay imágenes y no hay renderizador, sugerir entrada manual
    const hasImages = slideImages.length > 0;
    const needsManualEntry = (!hasImages && !rendererConfigured);

    const payload = {
      success: true,
      url: slideUrl,
      title: analysis.title,
      description: analysis.description,
      author: analysis.author,
      slideCount: analysis.slideCount,
      detectedSlideCount,
      limits: getPublicLimits(),
      keywords: analysis.keywords,
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
    return sendError(res, error, {
      label: 'Error en /api/inspect',
      forceStatus: 500,
      maskServerErrors: false,
      fallbackMessage: 'Error al inspeccionar la presentación',
      logStack: true
    });
  }
});

app.post('/api/prompt', promptLimiter, async (req, res) => {
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
      const rendererConfigured = Boolean(getRuntime().rendererUrl);

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

    // Texto de diapositivas opcional: se acota en un único lugar para que un
    // cuerpo grande no pueda inflar el resumen ni divergir de la heurística.
    const slideTexts = normalizeSlideTexts(analysisInput.slideTexts);

    const prompt = buildPresentationPrompt({ analysis: analysisInput, options: options || {} });
    const result = buildAnalysis(analysisInput);
    const summary = buildStructuredSummary({ ...analysisInput, slideTexts });

    return res.json({
      success: true,
      prompt,
      analysis: result,
      summary,
      characterCount: prompt.length
    });
  } catch (error) {
    return sendError(res, error, {
      label: 'Error en /api/prompt',
      maskServerErrors: false,
      fallbackMessage: 'No se pudo generar el prompt',
      logStack: true
    });
  }
});

app.get('/api/progress/:id', progressLimiter, (req, res) => {
  const { id } = req.params;

  if (!isValidJobId(id)) {
    return res.status(400).json({ success: false, error: 'ID de progreso inválido' });
  }

  const progress = progressTracker.get(id);
  if (!progress) {
    return res.status(404).json({ success: false, error: 'Progreso no encontrado' });
  }

  return res.json({ success: true, progress });
});

app.post('/api/download', downloadLimiter, async (req, res) => {
  const body = req.body || {};
  const progressId = isValidJobId(body.progressId) ? body.progressId : null;
  const report = progressId
    ? progressTracker.create(progressId, {
      format: String(body.format || 'pdf').toLowerCase(),
      quality: String(body.quality || 'sd').toLowerCase()
    })
    : null;

  try {
    const result = await generateDownload(req.body, {
      getCachedInspection,
      onProgress: report
    });

    if (report) report({ stage: 'done' });

    // El archivo se envía en esta misma respuesta. Devolver una URL
    // `/download/{jobId}/...` fallaba en Vercel cuando la siguiente petición
    // caía en otra instancia y no encontraba el archivo de `/tmp`.
    return sendGeneratedFile(res, {
      filePath: result.filePath,
      fileName: result.fileName,
      title: result.title,
      format: result.format,
      quality: result.quality,
      slideCount: result.imageCount,
      source: result.source,
      warnings: result.warnings,
      failedSlideCount: result.failedSlideCount,
      onCleanup: () => cleanupJobDir(result.filePath)
    });
  } catch (error) {
    if (report) report({ stage: 'failed' });
    // Los errores 4xx son peticiones inválidas; solo se registran los 5xx.
    // En producción se enmascaran los 5xx, como en la implementación original.
    return sendError(res, error, {
      label: 'Error en /api/download',
      fallbackMessage: 'Error al generar la descarga'
    });
  }
});

// Ruta heredada: las descargas nuevas envían el archivo en la respuesta de
// /api/download y borran el trabajo, así que solo sirve para enlaces antiguos
// o para depurar en local.
app.get('/download/:jobId/:filename', (req, res) => {
  const { jobId, filename } = req.params;

  // Validar que jobId sea un UUID v4 para prevenir path traversal o inyección.
  // Esta validación debe venir PRIMERO, antes que cualquier path.resolve o fs.existsSync.
  if (!isValidJobId(jobId)) {
    return res.status(400).json({ success: false, error: 'ID de trabajo inválido' });
  }

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
  res.setHeader('Content-Type', MIME_BY_EXTENSION[extension] || 'application/octet-stream');

  return res.download(filePath, safeName);
});

app.use('/api/scribd', scribdRouter);

const jobStore = new MemoryJobStore();
const artifactStore = new MemoryArtifactStore();
app.use(createJobsRouter({ jobStore, artifactStore, isEnabled: jobsRunnable }));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'Endpoint no encontrado' });
  }

  return res.status(404).send('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>404</title></head><body><h1>404 - Página no encontrada</h1></body></html>');
});

app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  });

  // En local el worker vive en el mismo proceso y comparte los stores en
  // memoria. Un guardia `inFlight` evita que dos ticks generen a la vez.
  if (jobsRunnable) {
    const { processNextJob, sweepExpired } = require('../services/jobWorker');
    const { DEFAULT_MAX_ATTEMPTS } = require('../services/jobStore');
    const maxAttempts = Number.isFinite(maxJobAttempts) && maxJobAttempts > 0
      ? Math.floor(maxJobAttempts)
      : DEFAULT_MAX_ATTEMPTS;

    let inFlight = false;
    let lastStaleScanAt = 0;
    let lastSweepAt = Date.now();

    const workerTimer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;

      try {
        const result = await processNextJob({
          jobStore,
          artifactStore,
          maxAttempts,
          lastStaleScanAt
        });
        if (result.staleScanned) lastStaleScanAt = Date.now();
        if (result.processed) {
          console.log(`[jobs] ${result.jobId}: ${result.status}`);
        }
      } catch (error) {
        console.error('[jobs] Error en el worker:', error.message);
      } finally {
        inFlight = false;
      }

      // La limpieza es poco frecuente: evita recorrer los stores cada segundo.
      if (Date.now() - lastSweepAt >= 60_000) {
        lastSweepAt = Date.now();
        sweepExpired({ jobStore, artifactStore }).catch((error) => {
          console.error('[jobs] Error al limpiar caducados:', error.message);
        });
      }
    }, 1000);
    workerTimer.unref();
  }
}

module.exports = app;
