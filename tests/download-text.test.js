const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const app = require('../server/app');
const { validateDownloadRequest } = require('../services/downloadService');
const { downloadPresentation } = require('../services/slideshareService');
const { buildDownloadHeaders, MIME_BY_EXTENSION } = require('../utils/fileResponse');

const SLIDE_URL = 'https://www.slideshare.net/slideshow/tema-de-prueba/123456789';
const IMAGE_URL = 'https://image.slidesharecdn.com/deck/abc123/name-1-1024.jpg';

test('la validación acepta txt y md y mantiene el rechazo de formatos desconocidos', () => {
  const txt = validateDownloadRequest({ url: SLIDE_URL, format: 'txt' });
  const md = validateDownloadRequest({ url: SLIDE_URL, format: 'md' });

  assert.equal(txt.format, 'txt');
  assert.equal(md.format, 'md');
  assert.throws(
    () => validateDownloadRequest({ url: SLIDE_URL, format: 'exe' }),
    (error) => error.status === 400
  );
});

test('los MIME de texto se envían con juego de caracteres', () => {
  assert.equal(MIME_BY_EXTENSION['.txt'], 'text/plain; charset=utf-8');
  assert.equal(MIME_BY_EXTENSION['.md'], 'text/markdown; charset=utf-8');
});

test('las cabeceras de descarga conservan X-Download-* y codifican los avisos', () => {
  const headers = buildDownloadHeaders({
    fileName: 'tema.md',
    title: 'Tema con ñ',
    format: 'md',
    slideCount: 3,
    warnings: ['Sin OCR; solo metadatos']
  });

  assert.equal(headers['X-Download-File-Name'], 'tema.md');
  assert.equal(headers['X-Download-Format'], 'md');
  assert.equal(headers['X-Download-Slides'], '3');
  assert.equal(headers['X-Download-Warnings'], encodeURIComponent('Sin OCR; solo metadatos'));
});

test('la descarga Markdown se genera sin OCR y sin llamar al renderizador', async () => {
  const previousOcr = process.env.OCR_ENABLED;
  delete process.env.OCR_ENABLED;

  try {
    const result = await downloadPresentation(SLIDE_URL, 'md', 'sd', {
      imageUrls: [IMAGE_URL],
      title: 'Tema de prueba'
    });

    const content = fs.readFileSync(result.filePath, 'utf8');

    assert.equal(result.format, 'md');
    assert.equal(result.source, 'metadata');
    assert.equal(result.imageCount, 1);
    assert.match(content, /^# Tema de prueba/m);
    assert.match(content, /## Diapositiva 1/);
    assert.match(content, /Metadatos públicos \(sin OCR\)/);
    assert.ok(result.warnings.some((warning) => warning.includes('No se aplicó OCR')));
    fs.rmSync(path.dirname(result.filePath), { recursive: true, force: true });
  } finally {
    if (previousOcr === undefined) delete process.env.OCR_ENABLED;
    else process.env.OCR_ENABLED = previousOcr;
  }
});

test('POST /api/download envía el Markdown y los avisos en la misma respuesta', async () => {
  const previousOcr = process.env.OCR_ENABLED;
  delete process.env.OCR_ENABLED;
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: SLIDE_URL,
        format: 'md',
        title: 'Tema HTTP',
        imageUrls: [IMAGE_URL]
      })
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/markdown/);
    assert.equal(response.headers.get('x-download-format'), 'md');
    assert.equal(
      decodeURIComponent(response.headers.get('x-download-warnings') || ''),
      'No se aplicó OCR; el texto procede de metadatos públicos.'
    );
    assert.match(body, /^# Tema HTTP/m);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (previousOcr === undefined) delete process.env.OCR_ENABLED;
    else process.env.OCR_ENABLED = previousOcr;
  }
});

test('la descarga sin imágenes y sin OCR sigue entregando metadatos', async () => {
  const previousOcr = process.env.OCR_ENABLED;
  delete process.env.OCR_ENABLED;
  const previousRenderer = process.env.RENDERER_URL;
  delete process.env.RENDERER_URL;

  try {
    const result = await downloadPresentation(SLIDE_URL, 'txt', 'sd', {
      title: 'Solo metadatos'
    });

    const content = fs.readFileSync(result.filePath, 'utf8');
    assert.match(content, /Título: Solo metadatos/);
    assert.match(content, /Diapositivas detectadas: 0/);
    assert.equal(result.imageCount, 0);

    // Limpieza explícita del directorio del trabajo de esta prueba.
    fs.rmSync(path.dirname(result.filePath), { recursive: true, force: true });
  } finally {
    if (previousOcr === undefined) delete process.env.OCR_ENABLED;
    else process.env.OCR_ENABLED = previousOcr;
    if (previousRenderer === undefined) delete process.env.RENDERER_URL;
    else process.env.RENDERER_URL = previousRenderer;
  }
});
