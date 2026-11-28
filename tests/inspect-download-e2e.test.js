const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const app = require('../server/app.js');
const scribdService = require('../services/scribdService');
const { createScribdService } = scribdService;

const ROOT = path.join(__dirname, '..');
const SLIDE_URL = 'https://slideshare.net/slideshow/demo/123456';
const SCRIBD_URL = 'https://es.scribd.com/document/900000999/demo';

// PNG 1x1 válido: suficiente para generar un PDF sin descargar imágenes reales.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function startServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    port: server.address().port,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  return { status: response.status, body: await response.json() };
}

function jsonPost(body) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

/** Redirige el CDN de SlideShare a un servidor local sin tocar código de producción. */
function redirectSlideImages(port) {
  const original = https.get;

  https.get = function patchedGet(url, options, callback) {
    const target = typeof url === 'string' ? url : url.href || String(url);

    if (target.includes('slidesharecdn.com')) {
      const local = target.replace(
        /^https:\/\/image\.slidesharecdn\.com/,
        `http://127.0.0.1:${port}`
      );
      return http.get(local, options, callback);
    }

    return original.apply(https, arguments);
  };

  return () => {
    https.get = original;
  };
}

function slideUrls() {
  return [1, 2, 3].map(
    (number) => `https://image.slidesharecdn.com/demo/v1/slide-${number}-638.jpg`
  );
}

async function startRenderer(imageUrls) {
  return startServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/render') {
      res.writeHead(404);
      res.end();
      return;
    }

    req.resume();
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        title: 'Demo E2E',
        description: 'Presentación de prueba',
        author: 'QA',
        imageUrls
      }));
    });
  });
}

async function startImageServer({ failNumbers = [] } = {}) {
  return startServer((req, res) => {
    const match = req.url.match(/slide-(\d+)-/);

    if (match && failNumbers.includes(Number(match[1]))) {
      res.writeHead(404);
      res.end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': String(TINY_PNG.length)
    });
    res.end(TINY_PNG);
  });
}

function createFakeTransport(routes) {
  const transport = async (url, options = {}) => {
    for (const route of routes) {
      if (!route.match.test(url)) continue;

      const reply = typeof route.reply === 'function'
        ? await route.reply(url, options)
        : route.reply;

      if (reply && typeof reply === 'object' && !Buffer.isBuffer(reply)) {
        return { status: 200, headers: {}, buffer: Buffer.alloc(0), ...reply };
      }

      return {
        status: 200,
        headers: {},
        buffer: Buffer.isBuffer(reply) ? reply : Buffer.from(String(reply))
      };
    }

    return { status: 404, headers: {}, buffer: Buffer.alloc(0) };
  };

  return transport;
}

function buildScribdEmbed(documentId, contentUrl) {
  return `<!doctype html><html><body>
<script>
docManager.assetPrefix = "abc123";
new Scribd.EmbedsShow({"document":{"id":${documentId},"title":"Documento E2E","page_count":1},"toolbar":{"downloadable":true,"share_opts":{"thumbnail_url":"https://imgv2-1-f.scribdassets.com/img/document/${documentId}/original/hash/1"}}});
"formats": [{"extension": "pdf"}, {"extension": "txt"}]
docManager.addPage({ pageNum: 1, fonts: [], origWidth: 902, origHeight: 1167, containerElem: document.getElementById("outer_page_1"), blur: false, contentUrl: "${contentUrl}" });
</script>
</body></html>`;
}

async function waitForCleanup(directory) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!fs.existsSync(directory)) return true;
    await new Promise((resolve) => setImmediate(resolve));
  }

  return !fs.existsSync(directory);
}

async function withSlideInfra(options, callback) {
  const renderer = await startRenderer(slideUrls());
  const images = await startImageServer(options);
  const restoreGet = redirectSlideImages(images.port);
  const previousRendererUrl = process.env.RENDERER_URL;
  process.env.RENDERER_URL = `http://127.0.0.1:${renderer.port}`;
  const appServer = await startServer(app);

  try {
    return await callback(`http://127.0.0.1:${appServer.port}`);
  } finally {
    await appServer.close();
    restoreGet();

    if (previousRendererUrl === undefined) delete process.env.RENDERER_URL;
    else process.env.RENDERER_URL = previousRendererUrl;

    await renderer.close();
    await images.close();
  }
}

test('flujo SlideShare: inspección con renderer, descarga PDF y progreso completado', async () => {
  await withSlideInfra({}, async (base) => {
    const inspection = await fetchJson(`${base}/api/inspect`, jsonPost({ url: SLIDE_URL }));

    assert.equal(inspection.status, 200);
    assert.equal(inspection.body.success, true);
    assert.equal(inspection.body.method, 'renderer');
    assert.equal(inspection.body.slideCount, 3);
    assert.equal(inspection.body.previewImages.length, 3);

    const progressId = randomUUID();
    const response = await fetch(`${base}/api/download`, jsonPost({
      url: SLIDE_URL,
      format: 'pdf',
      quality: 'sd',
      title: inspection.body.title,
      imageUrls: inspection.body.previewImages,
      progressId
    }));

    const bytes = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/pdf/);
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.equal(response.headers.get('x-download-format'), 'pdf');
    assert.equal(response.headers.get('x-download-slides'), '3');
    assert.equal(response.headers.get('x-download-warnings'), null);

    const progress = await fetchJson(`${base}/api/progress/${progressId}`);
    assert.equal(progress.status, 200);
    assert.equal(progress.body.progress.stage, 'done');
    assert.equal(progress.body.progress.percent, 100);
  });
});

test('flujo SlideShare con una imagen caída: avisa y entrega el resto', async () => {
  await withSlideInfra({ failNumbers: [2] }, async (base) => {
    const inspection = await fetchJson(`${base}/api/inspect`, jsonPost({ url: SLIDE_URL }));
    assert.equal(inspection.body.slideCount, 3);

    const response = await fetch(`${base}/api/download`, jsonPost({
      url: SLIDE_URL,
      format: 'pdf',
      quality: 'sd',
      title: inspection.body.title,
      imageUrls: inspection.body.previewImages
    }));

    const bytes = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.equal(response.headers.get('x-download-failed-slides'), '1');
    assert.equal(response.headers.get('x-download-slides'), '2');
    assert.match(
      decodeURIComponent(response.headers.get('x-download-warnings') || ''),
      /1 diapositiva no se pudieron descargar; el archivo incluye el resto\./
    );
  });
});

test('flujo Scribd: inspección y descarga con transporte simulado', async () => {
  const documentId = '900000999';
  const contentUrl = 'https://html.scribdassets.com/abc/pages/1-aaa.jsonp';
  const html = buildScribdEmbed(documentId, contentUrl);
  const pageMarkup =
    '<div class="newpage" id="page1"><div class=text_layer><div class=ie_fix>' +
    '<div class=ff1 style="font-size:20px">' +
    '<span class=a style="left:10px;top:10px">Contenido de prueba</span>' +
    '</div></div></div></div>';
  const jsonp = `window.page1_callback([${JSON.stringify(pageMarkup)}]);`;
  const transport = createFakeTransport([
    { match: /\/embeds\/\d+\/content/, reply: html },
    { match: /\/document_downloads\/\d+/, reply: html },
    { match: /\/pages\/1-aaa\.jsonp/, reply: jsonp },
    { match: /\/images\//, reply: TINY_PNG }
  ]);
  const fake = createScribdService({ transport });
  const originalInspect = scribdService.inspect;
  const originalDownload = scribdService.download;
  let jobId = null;

  scribdService.inspect = (...args) => fake.inspect(...args);
  scribdService.download = async (...args) => {
    const result = await fake.download(...args);
    jobId = result.jobId;
    return result;
  };

  const { server, port, close } = await startServer(app);

  try {
    const base = `http://127.0.0.1:${port}`;
    const inspection = await fetchJson(
      `${base}/api/scribd/inspect?url=${encodeURIComponent(SCRIBD_URL)}`
    );

    assert.equal(inspection.status, 200);
    assert.equal(inspection.body.success, true);
    assert.equal(inspection.body.document.title, 'Documento E2E');
    assert.equal(inspection.body.document.pageCount, 1);

    const response = await fetch(`${base}/api/scribd/download`, jsonPost({
      url: SCRIBD_URL,
      format: 'pdf'
    }));
    const bytes = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/pdf/);
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.equal(response.headers.get('x-download-format'), 'pdf');
    assert.equal(response.headers.get('x-download-total-pages'), '1');
    assert.match(jobId || '', /^[0-9a-f-]{36}$/);
    assert.equal(await waitForCleanup(path.join(ROOT, 'downloads', jobId)), true);
  } finally {
    scribdService.inspect = originalInspect;
    scribdService.download = originalDownload;
    await close();
  }
});
