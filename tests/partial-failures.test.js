const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { downloadImagesConcurrently } = require('../services/slideshareService');
const { buildDownloadHeaders } = require('../utils/fileResponse');

const ROOT = path.resolve(__dirname, '..');
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function startMixedServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url.startsWith('/falla')) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('fallo simulado');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': TINY_PNG.length });
      res.end(TINY_PNG);
    });

    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        ok: `http://127.0.0.1:${server.address().port}/ok.png`,
        fail: `http://127.0.0.1:${server.address().port}/falla.png`
      });
    });
  });
}

test('downloadImagesConcurrently avisa de cada fallo y sigue con el resto', async (t) => {
  const { server, ok, fail } = await startMixedServer();
  t.after(() => server.close());

  const events = [];
  const images = await downloadImagesConcurrently(
    [ok, fail, ok],
    'sd',
    1,
    10 * 1024 * 1024,
    (event) => events.push(event)
  );

  assert.equal(images.length, 2, 'el archivo se genera con las imágenes válidas');
  assert.equal(events.length, 3);
  assert.deepEqual(
    events.filter((event) => event.failedUrl).map((event) => event.failedUrl),
    [fail]
  );
  assert.deepEqual(
    events.map((event) => event.current),
    [1, 2, 3]
  );
});

function startDelayedServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const send = () => {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': TINY_PNG.length });
        res.end(TINY_PNG);
      };

      if (req.url.includes('slow')) setTimeout(send, 80);
      else send();
    });

    server.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      resolve({
        server,
        urls: [`${base}/slow.png`, `${base}/fast1.png`, `${base}/fast2.png`]
      });
    });
  });
}

test('el contador de progreso no retrocede aunque terminen desordenadas', async (t) => {
  const { server, urls } = await startDelayedServer();
  t.after(() => server.close());

  const events = [];
  await downloadImagesConcurrently(urls, 'sd', 2, 10 * 1024 * 1024, (event) => events.push(event));

  assert.deepEqual(events.map((event) => event.current), [1, 2, 3]);
  assert.equal(events.every((event) => event.total === 3), true);
});

test('las cabeceras informan del número de diapositivas omitidas', () => {
  const headers = buildDownloadHeaders({
    fileName: 'salida.pdf',
    slideCount: 43,
    failedSlideCount: 2,
    warnings: ['2 diapositivas no se pudieron descargar; el archivo incluye el resto.']
  });

  assert.equal(headers['X-Download-Failed-Slides'], '2');
  assert.equal(
    headers['X-Download-Warnings'],
    encodeURIComponent('2 diapositivas no se pudieron descargar; el archivo incluye el resto.')
  );

  assert.equal(buildDownloadHeaders({ failedSlideCount: 0 })['X-Download-Failed-Slides'], undefined);
});

test('downloadPresentation convierte los fallos en avisos aditivos', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'services', 'slideshare', 'downloadPresentation.js'),
    'utf8'
  );

  assert.match(source, /failedImages\.push\(String\(failedUrl\)\)/);
  assert.match(source, /failedSlideCount: failedImages\.length/);
  assert.match(source, /warnings,\s*\n\s*failedSlideCount: failedImages\.length/);
});
