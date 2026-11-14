const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const { downloadPresentation, normalizeSlideShareUrl, SUPPORTED_FORMATS, extractPresentationInfoLite, extractPresentationInfoViaRenderer } = require('./services/slideshareService');
const { buildPresentationPrompt, buildAnalysis } = require('./services/promptService');

const app = express();
const PORT = process.env.PORT || 8080;
const publicDir = path.join(__dirname, 'public');
const downloadsDir = path.join(__dirname, 'downloads');

const DOWNLOAD_MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppsx': 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  '.potx': 'application/vnd.openxmlformats-officedocument.presentationml.template',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(publicDir, { maxAge: '1h', etag: true }));

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
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/ai', (req, res) => {
  res.sendFile(path.join(publicDir, 'ai.html'));
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

    let info = null;
    let method = 'lite';
    let fallbackUsed = false;

    // Intento 1: fetch directo (funciona en serverless, pero SlideShare puede bloquear)
    try {
      info = await extractPresentationInfoLite(slideUrl);
      method = 'lite';
    } catch (error) {
      console.warn('Fetch directo falló:', error.message);
    }

    // Intento 2: renderizador externo (si fetch falló o no devolvió imágenes y está configurado)
    const hasImages = info && info.imageUrls && info.imageUrls.length > 0;
    const rendererConfigured = Boolean(process.env.RENDERER_URL);

    if (!hasImages && rendererConfigured) {
      try {
        info = await extractPresentationInfoViaRenderer(slideUrl);
        method = 'renderer';
        fallbackUsed = true;
      } catch (rendererError) {
        console.warn('Renderizador externo falló:', rendererError.message);
        // Mantener el info del intento 1 (puede estar vacío)
      }
    }

    if (!info) {
      return res.status(500).json({
        success: false,
        error: 'No se pudo inspeccionar la presentación. Intenta nuevamente o configura un servidor de renderizado externo.'
      });
    }

    // Si no hay imágenes y no hay renderizador, sugerir entrada manual
    const needsManualEntry = (!hasImages && !rendererConfigured);

    return res.json({
      success: true,
      url: slideUrl,
      title: info.title,
      description: info.description || '',
      author: info.author || '',
      slideCount: info.imageUrls.length,
      previewImages: info.imageUrls.slice(0, 8),
      galleryImages: info.imageUrls.slice(0, 60),
      previewQuality: 'hd',
      challengeDetected: info.challengeDetected || false,
      method,
      fallbackUsed,
      needsManualEntry
    });
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

      try {
        info = await extractPresentationInfoLite(slideUrl);
      } catch (error) {
        console.warn('Fetch directo falló en /api/prompt:', error.message);
      }

      const hasImages = info && info.imageUrls && info.imageUrls.length > 0;
      const rendererConfigured = Boolean(process.env.RENDERER_URL);

      if (!hasImages && rendererConfigured) {
        try {
          info = await extractPresentationInfoViaRenderer(slideUrl);
        } catch (rendererError) {
          console.warn('Renderizador externo falló en /api/prompt:', rendererError.message);
        }
      }

      if (info) {
        analysisInput.title = info.title;
        analysisInput.description = info.description;
        analysisInput.author = info.author;
        analysisInput.slideCount = info.imageUrls.length;
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
    const { url, format, quality } = req.body || {};

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

    const result = await downloadPresentation(normalizedUrl, selectedFormat, selectedQuality);
    return res.json({
      success: true,
      title: result.title,
      format: result.format,
      quality: result.quality,
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
