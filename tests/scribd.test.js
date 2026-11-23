const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const {
  MAX_PAGES,
  SUPPORTED_FORMATS,
  createScribdService,
  decodeContentEncoding,
  normalizeScribdUrl,
  extractEmbedConfig,
  extractPageManifest,
  parseJsonpMarkup,
  parseTextLayer,
  looksObfuscated
} = require('../services/scribdService');

const app = require('../server/app.js');

// PNG 1x1 válido: suficiente para comprobar que una página con imagen se usa
// tal cual, sin descargar nada real.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function startServerForTest() {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      resolve({ port: server.address().port, server });
    });
  });
}

function request({ port, method = 'GET', path: requestPath = '/', body = null, headers = {} }) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method,
      headers: { 'Content-Type': 'application/json', ...headers }
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let parsed;
        try {
          parsed = data ? JSON.parse(data) : null;
        } catch {
          parsed = data;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Transporte falso: responde según la primera ruta que coincida.
 * Cada `reply` puede ser un Buffer/string o un objeto de respuesta completo.
 */
function createFakeTransport(routes) {
  const calls = [];

  const transport = async (url, options = {}) => {
    calls.push(url);

    for (const route of routes) {
      if (!route.match.test(url)) continue;

      const value = typeof route.reply === 'function' ? await route.reply(url, options) : route.reply;

      if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
        return { status: 200, headers: {}, buffer: Buffer.alloc(0), ...value };
      }

      return { status: 200, headers: {}, buffer: Buffer.isBuffer(value) ? value : Buffer.from(String(value)) };
    }

    return { status: 404, headers: {}, buffer: Buffer.alloc(0) };
  };

  transport.calls = calls;
  return transport;
}

function buildEmbedHtml({
  documentId,
  title = 'Documento de prueba',
  pageCount = 2,
  downloadable = true,
  pages = []
}) {
  const inlinePages = pages
    .filter((page) => !page.contentUrl && page.markup)
    .map((page) => `<div class="outer_page" id="outer_page_${page.pageNum}">${page.markup}</div>`)
    .join('\n');

  const addPageCalls = pages
    .map(
      (page) =>
        `docManager.addPage({ pageNum: ${page.pageNum}, fonts: [], origWidth: 902, origHeight: 1167, containerElem: document.getElementById("outer_page_${page.pageNum}"), blur: false${
          page.contentUrl ? `, contentUrl: "${page.contentUrl}"` : ''
        } });`
    )
    .join('\n');

  return `<!doctype html><html><body>
${inlinePages}
<script>
docManager.assetPrefix = "abc123";
new Scribd.EmbedsShow({"document":{"id":${documentId},"title":"${title}","page_count":${pageCount}},"toolbar":{"downloadable":${downloadable},"share_opts":{"thumbnail_url":"https://imgv2-1-f.scribdassets.com/img/document/${documentId}/original/hash/1"}}});
"formats": [{"extension": "pdf"}, {"extension": "txt"}]
${addPageCalls}
</script>
</body></html>`;
}

function buildDocumentRoutes({
  documentId,
  title,
  pages,
  downloadable = true,
  imageReply = TINY_PNG
}) {
  const html = buildEmbedHtml({ documentId, title, pages, downloadable, pageCount: pages.length });

  return [
    { match: /\/embeds\/\d+\/content/, reply: html },
    { match: /\/document_downloads\/\d+/, reply: html },
    { match: /\/images\//, reply: imageReply }
  ];
}

/* ------------------------------------------------------------------ *
 * Validación de enlaces
 * ------------------------------------------------------------------ */

test('normalizeScribdUrl acepta documentos de cualquier subdominio', () => {
  assert.deepEqual(normalizeScribdUrl('https://es.scribd.com/document/123456789/Titulo'), {
    documentId: '123456789',
    canonicalUrl: 'https://www.scribd.com/document/123456789'
  });

  assert.equal(normalizeScribdUrl('scribd.com/doc/42/x').documentId, '42');
  assert.equal(normalizeScribdUrl('https://pt.scribd.com/document/7').documentId, '7');
});

test('normalizeScribdUrl acepta presentaciones de Scribd', () => {
  assert.deepEqual(
    normalizeScribdUrl('https://es.scribd.com/presentation/387702694/Diferencias-Entre-Mono-Poligastricos'),
    {
      documentId: '387702694',
      canonicalUrl: 'https://www.scribd.com/presentation/387702694'
    }
  );

  assert.equal(normalizeScribdUrl('https://www.scribd.com/presentation/42/x').documentId, '42');
});

test('normalizeScribdUrl rechaza dominios, esquemas y rutas no válidas', () => {
  const invalid = [
    'https://example.com/document/123',
    'https://scribd.evil.com/document/123',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://es.scribd.com/slideshow/123',
    'https://es.scribd.com/document/abc',
    'https://user:pass@es.scribd.com/document/123',
    'https://es.scribd.com:8443/document/123',
    '',
    null,
    123
  ];

  for (const value of invalid) {
    assert.equal(normalizeScribdUrl(value), null, `debería rechazar: ${value}`);
  }
});

/* ------------------------------------------------------------------ *
 * Parsers
 * ------------------------------------------------------------------ */

test('extractEmbedConfig lee título, páginas, descarga y miniatura', () => {
  const html = buildEmbedHtml({
    documentId: 555,
    title: 'Mi documento',
    pageCount: 9,
    downloadable: false,
    pages: []
  });

  const config = extractEmbedConfig(html);
  assert.equal(config.documentId, '555');
  assert.equal(config.title, 'Mi documento');
  assert.equal(config.pageCount, 9);
  assert.equal(config.downloadable, false);
  assert.equal(config.assetPrefix, 'abc123');
  assert.match(config.thumbnailUrl, /^https:\/\/imgv2-1-f\.scribdassets\.com\//);
});

test('extractPageManifest separa páginas con contentUrl y páginas en línea', () => {
  const html = `
    <div id="outer_page_1"><div class=text_layer><span>Hola</span></div></div>
    <script>
      docManager.addPage({ pageNum: 1, origWidth: 902, origHeight: 1167, containerElem: document.getElementById("outer_page_1") });
      docManager.addPage({ pageNum: 2, origWidth: 902, origHeight: 1167, contentUrl: "http://html.scribd.com/abc/pages/2-bbb.jsonp" });
    </script>`;

  const pages = extractPageManifest(html);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].pageNum, 1);
  assert.match(pages[0].inlineHtml, /outer_page_1/);
  assert.equal(pages[0].contentUrl, null);
  assert.equal(pages[1].contentUrl, 'https://html.scribdassets.com/abc/pages/2-bbb.jsonp');
});

test('parseJsonpMarkup extrae el HTML del callback de página', () => {
  assert.equal(
    parseJsonpMarkup('window.page1_callback(["<div class=\\"newpage\\">Hola</div>"]);'),
    '<div class="newpage">Hola</div>'
  );
  assert.equal(parseJsonpMarkup('no es jsonp'), null);
  assert.equal(parseJsonpMarkup(null), null);
});

test('parseTextLayer convierte coordenadas ×5 y tamaños del visor', () => {
  const markup =
    '<div class=text_layer><div class=ie_fix>' +
    '<div class="ff1" style="font-size:100px">' +
    '<span class=a style="left:100px;top:200px;color:#333">Hola mundo</span>' +
    '</div></div></div>';

  const runs = parseTextLayer(markup, 902, 1167);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].text, 'Hola mundo');
  assert.equal(runs[0].x, 20);
  assert.equal(runs[0].y, 40);
  assert.equal(runs[0].fontSize, 20);
  assert.equal(runs[0].color, '#333');
});

test('looksObfuscated distingue texto legible de una sustitución cifrada', () => {
  const readable =
    'Este documento explica cómo preparar una presentación con ejemplos y consejos ' +
    'para la exposición oral. Los asistentes deben comprender el mensaje principal ' +
    'y recordar las ideas clave que se presentan en cada diapositiva.';
  assert.equal(looksObfuscated(readable, 'Presentación'), false);

  const gibberish =
    'Jsqujdn mj gn prjsjktnlcük irng liktckunlcük pnrn pgnkcaclnr. ' +
    'Ztcgclj jg airdnti mj jsqujdn n liktckunlcük. Rujmj n pgnkcaclnr ' +
    'liktckunlcük jg irng pnrn pgnkcaclnr ztcgclj jg airdnti.';
  assert.equal(looksObfuscated(gibberish, 'Esquema'), true);
});

test('decodeContentEncoding descomprime gzip y respeta el límite', () => {
  const original = Buffer.from('contenido de prueba');
  const gzipped = zlib.gzipSync(original);

  assert.deepEqual(decodeContentEncoding(gzipped, 'gzip', 1024), original);
  assert.deepEqual(decodeContentEncoding(original, 'identity', 1024), original);

  assert.throws(
    () => decodeContentEncoding(gzipped, 'gzip', 4),
    (error) => error.status === 502
  );
});

/* ------------------------------------------------------------------ *
 * Servicio: inspect y download con transporte inyectado
 * ------------------------------------------------------------------ */

test('inspect devuelve metadatos del documento', async () => {
  const documentId = 900000001;
  const transport = createFakeTransport(
    buildDocumentRoutes({
      documentId,
      title: 'Documento de prueba',
      pages: [
        { pageNum: 1, contentUrl: 'https://html.scribdassets.com/abc/pages/1-aaa.jsonp' },
        { pageNum: 2, contentUrl: 'https://html.scribdassets.com/abc/pages/2-bbb.jsonp' }
      ]
    })
  );

  const service = createScribdService({ transport });
  const info = await service.inspect(`https://es.scribd.com/document/${documentId}/x`);

  assert.equal(info.documentId, String(documentId));
  assert.equal(info.title, 'Documento de prueba');
  assert.equal(info.pageCount, 2);
  assert.equal(info.downloadable, true);
  assert.deepEqual(info.formats, ['pdf', 'txt']);
  assert.deepEqual(info.supportedFormats, SUPPORTED_FORMATS);
  assert.equal(info.maxPages, MAX_PAGES);
});

test('inspect acepta enlaces /presentation/ con el mismo id', async () => {
  const documentId = 900000011;
  const transport = createFakeTransport(
    buildDocumentRoutes({
      documentId,
      title: 'Presentación de prueba',
      pages: [
        { pageNum: 1, contentUrl: 'https://html.scribdassets.com/abc/pages/1-aaa.jsonp' }
      ]
    })
  );

  const service = createScribdService({ transport });
  const info = await service.inspect(
    `https://es.scribd.com/presentation/${documentId}/Diferencias-Entre-Mono-Poligastricos`
  );

  assert.equal(info.documentId, String(documentId));
  assert.equal(info.title, 'Presentación de prueba');
  assert.equal(info.pageCount, 1);
  assert.equal(info.canonicalUrl, `https://www.scribd.com/presentation/${documentId}`);
});

test('inspect distingue el Client Challenge de un documento retirado', async () => {
  const documentId = 900000012;
  const challengeHtml = '<!doctype html><html><head><title>Client Challenge</title></head><body></body></html>';
  const transport = createFakeTransport([
    { match: /\/embeds\//, reply: challengeHtml },
    { match: /\/document_downloads\//, reply: challengeHtml }
  ]);

  const service = createScribdService({ transport });

  await assert.rejects(
    service.inspect(`https://es.scribd.com/document/${documentId}/x`),
    (error) => error.status === 403 && /bloqueó la petición/i.test(error.message)
  );
});

test('download genera un PDF con todas las páginas y limpia el trabajo', async () => {
  const documentId = 900000002;
  const transport = createFakeTransport(
    buildDocumentRoutes({
      documentId,
      title: 'Documento de prueba',
      pages: [
        { pageNum: 1, contentUrl: 'https://html.scribdassets.com/abc/pages/1-aaa.jsonp' },
        { pageNum: 2, contentUrl: 'https://html.scribdassets.com/abc/pages/2-bbb.jsonp' }
      ]
    })
  );

  const service = createScribdService({ transport });
  const result = await service.download({
    url: `https://es.scribd.com/document/${documentId}/x`,
    format: 'pdf'
  });

  const outputFile = path.join(__dirname, '..', 'downloads', result.jobId, result.fileName);

  try {
    assert.equal(result.pageCount, 2);
    assert.equal(result.totalPages, 2);
    assert.deepEqual(result.warnings, []);
    assert.match(result.downloadUrl, /^\/download\/[0-9a-f-]{36}\//);
    assert.equal(fs.existsSync(outputFile), true);
    assert.equal(fs.readFileSync(outputFile).subarray(0, 5).toString(), '%PDF-');
  } finally {
    fs.rmSync(path.join(__dirname, '..', 'downloads', result.jobId), {
      recursive: true,
      force: true
    });
  }
});

test('download rechaza formatos no soportados antes de pedir el documento', async () => {
  const transport = createFakeTransport([]);
  const service = createScribdService({ transport });

  await assert.rejects(
    service.download({ url: 'https://es.scribd.com/document/900000003/x', format: 'exe' }),
    (error) => error.status === 400
  );
  assert.equal(transport.calls.length, 0);
});

test('download respeta los documentos sin permiso de descarga', async () => {
  const documentId = 900000004;
  const transport = createFakeTransport(
    buildDocumentRoutes({
      documentId,
      title: 'Sin descarga',
      downloadable: false,
      pages: [{ pageNum: 1, contentUrl: 'https://html.scribdassets.com/abc/pages/1-aaa.jsonp' }]
    })
  );

  const service = createScribdService({ transport });

  await assert.rejects(
    service.download({ url: `https://es.scribd.com/document/${documentId}/x`, format: 'pdf' }),
    (error) => error.status === 403
  );
});

test('download rechaza documentos que superan el máximo de páginas', async () => {
  const documentId = 900000005;
  const pages = Array.from({ length: MAX_PAGES + 1 }, (_, index) => ({
    pageNum: index + 1,
    contentUrl: `https://html.scribdassets.com/abc/pages/${index + 1}-hash.jsonp`
  }));

  const transport = createFakeTransport(
    buildDocumentRoutes({ documentId, title: 'Demasiado largo', pages })
  );
  const service = createScribdService({ transport });

  await assert.rejects(
    service.download({ url: `https://es.scribd.com/document/${documentId}/x`, format: 'pdf' }),
    (error) => error.status === 422 && /máximo permitido/.test(error.message)
  );
});

test('download devuelve 422 cuando el texto está cifrado por sustitución', async () => {
  const documentId = 900000006;
  const gibberish =
    'Jsqujdn mj gn prjsjktnlcük irng liktckunlcük pnrn pgnkcaclnr. ' +
    'Ztcgclj jg airdnti mj jsqujdn n liktckunlcük. Rujmj n pgnkcaclnr ' +
    'liktckunlcük jg irng pnrn pgnkcaclnr ztcgclj jg airdnti.';

  const pageMarkup =
    '<div class="newpage" id="page1"><div class=text_layer><div class=ie_fix>' +
    '<div class="ff1" style="font-size:83px">' +
    `<span class=a style="left:100px;top:100px">${gibberish}</span>` +
    '</div></div></div></div>';

  const jsonp = `window.page1_callback([${JSON.stringify(pageMarkup)}]);`;

  const embedHtml = buildEmbedHtml({
    documentId,
    title: 'Esquema',
    pages: [{ pageNum: 1, contentUrl: 'https://html.scribdassets.com/abc/pages/1-aaa.jsonp' }]
  });

  const transport = createFakeTransport([
    { match: /\/embeds\/\d+\/content/, reply: embedHtml },
    { match: /\/document_downloads\/\d+/, reply: embedHtml },
    { match: /\/images\//, reply: { status: 404, buffer: Buffer.alloc(0) } },
    { match: /\/pages\/1-aaa\.jsonp/, reply: jsonp }
  ]);

  const service = createScribdService({ transport });

  await assert.rejects(
    service.download({ url: `https://es.scribd.com/document/${documentId}/x`, format: 'pdf' }),
    (error) => error.status === 422 && /texto protegido/i.test(error.message)
  );
});

/* ------------------------------------------------------------------ *
 * Endpoints HTTP
 * ------------------------------------------------------------------ */

test('GET /api/scribd/inspect sin url retorna 400', async () => {
  const { port, server } = await startServerForTest();
  try {
    const res = await request({ port, path: '/api/scribd/inspect' });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  } finally {
    server.close();
  }
});

test('GET /api/scribd/inspect rechaza enlaces ajenos a Scribd', async () => {
  const { port, server } = await startServerForTest();
  try {
    const res = await request({
      port,
      path: `/api/scribd/inspect?url=${encodeURIComponent('https://example.com/document/123')}`
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  } finally {
    server.close();
  }
});

test('POST /api/scribd/download sin url retorna 400', async () => {
  const { port, server } = await startServerForTest();
  try {
    const res = await request({ port, method: 'POST', path: '/api/scribd/download', body: {} });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  } finally {
    server.close();
  }
});

test('POST /api/scribd/download con formato inválido retorna 400', async () => {
  const { port, server } = await startServerForTest();
  try {
    const res = await request({
      port,
      method: 'POST',
      path: '/api/scribd/download',
      body: { url: 'https://es.scribd.com/document/123456789/x', format: 'exe' }
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  } finally {
    server.close();
  }
});

test('las rutas con path traversal o byte nulo se rechazan con 400', async () => {
  const { port, server } = await startServerForTest();
  try {
    const encoded = await request({ port, path: '/download/..%2F..%2Fetc%2Fpasswd/fake.pdf' });
    assert.equal(encoded.statusCode, 400);

    const nullByte = await request({ port, path: '/download/%00/fake.pdf' });
    assert.equal(nullByte.statusCode, 400);
  } finally {
    server.close();
  }
});
