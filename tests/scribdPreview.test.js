const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const sharp = require('sharp');

const {
  createScribdService,
  parseAbsImagePlacements,
  composePageFromAtlas
} = require('../services/scribdService');

const app = require('../server/app.js');

const PLACEMENT_MARKUP = `
<div class="newpage" id="page1" style="width: 4px; height: 3px">
  <img class="absimg" style="left:0px;top:0px;width:8px;height:6px;clip:rect(0px 4px 3px 0px)" orig="http://html.scribd.com/abc123/images/1-hash.png"/>
  <img class="absimg" style="left:-3px;top:-2px;width:8px;height:6px;clip:rect(3px 6px 5px 4px)" orig="http://html.scribd.com/abc123/images/1-hash.png"/>
</div>`;

const JSONP_MARKUP = `window.page1_callback(${JSON.stringify([PLACEMENT_MARKUP])});`;

async function buildAtlas() {
  return sharp({
    create: {
      width: 8,
      height: 6,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  })
    .composite([
      { input: Buffer.from('<svg width="4" height="3"><rect width="4" height="3" fill="#ff0000"/></svg>'), left: 0, top: 0 },
      { input: Buffer.from('<svg width="4" height="3"><rect width="4" height="3" fill="#0000ff"/></svg>'), left: 4, top: 3 }
    ])
    .png()
    .toBuffer();
}

function startServerForTest() {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      resolve({ port: server.address().port, server });
    });
  });
}

function request({ port, method = 'GET', path: requestPath = '/', body = null }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: requestPath,
        method,
        headers: { 'Content-Type': 'application/json' }
      },
      (res) => {
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
          resolve({ statusCode: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function fakeTransport(routes) {
  const transport = async (url, options = {}) => {
    for (const route of routes) {
      if (!route.match.test(url)) continue;
      const reply = typeof route.reply === 'function' ? await route.reply(url, options) : route.reply;
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

function embedHtml() {
  return `<!doctype html><html><body><script>
new Scribd.EmbedsShow({"document":{"id":42,"title":"Prueba de vista previa","page_count":1},"toolbar":{"downloadable":true}});
docManager.addPage({ pageNum: 1, origWidth: 4, origHeight: 3, contentUrl: "https://html.scribdassets.com/abc123/pages/1-hash.jsonp" });
</script></body></html>`;
}

test('la página /scribd muestra la vista previa y conecta con el endpoint', () => {
  const publicDir = path.join(__dirname, '..', 'public');
  const html = fs.readFileSync(path.join(publicDir, 'scribd.html'), 'utf8');
  const script = fs.readFileSync(path.join(publicDir, 'scribd.js'), 'utf8');
  const css = fs.readFileSync(path.join(publicDir, 'style.css'), 'utf8');

  assert.match(html, /id="scribd-preview"/);
  assert.match(html, /id="scribd-preview-grid"/);
  assert.match(html, /id="scribd-preview-hint"/);
  assert.match(script, /\/api\/scribd\/preview\?url=/);
  assert.match(script, /loadPreview\(info\)/);
  assert.match(css, /\.scribd-preview-grid \{[^}]*display: grid/s);
});

test('parseAbsImagePlacements convierte clip:rect en recortes y posiciones', () => {
  const placements = parseAbsImagePlacements(PLACEMENT_MARKUP);
  assert.equal(placements.length, 2);
  assert.deepEqual(placements[0], {
    src: 'https://html.scribdassets.com/abc123/images/1-hash.png',
    sx: 0,
    sy: 0,
    sw: 4,
    sh: 3,
    dx: 0,
    dy: 0
  });
  assert.deepEqual(placements[1], {
    src: 'https://html.scribdassets.com/abc123/images/1-hash.png',
    sx: 4,
    sy: 3,
    sw: 2,
    sh: 2,
    dx: 1,
    dy: 1
  });
});

test('composePageFromAtlas recorta la diapositiva y aplica los fragmentos', async () => {
  const atlas = await buildAtlas();
  const placements = parseAbsImagePlacements(PLACEMENT_MARKUP);

  const page = await composePageFromAtlas(
    atlas,
    placements,
    { pageNum: 1, width: 4, height: 3 },
    'https://html.scribdassets.com/abc123/images/1-hash.png'
  );

  assert.ok(page);
  const { data, info } = await sharp(page).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 4);
  assert.equal(info.height, 3);

  const pixel = (x, y) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3));
  assert.deepEqual(pixel(0, 0), [255, 0, 0]);
  assert.deepEqual(pixel(3, 2), [255, 0, 0]);
  assert.deepEqual(pixel(1, 1), [0, 0, 255]);
});

test('composePageFromAtlas devuelve null sin reglas de recorte', async () => {
  const atlas = await buildAtlas();
  const result = await composePageFromAtlas(atlas, [], { pageNum: 1, width: 4, height: 3 }, null);
  assert.equal(result, null);
});

test('preview devuelve miniaturas JPEG de las primeras páginas', async () => {
  const atlas = await buildAtlas();
  const transport = fakeTransport([
    { match: /\/embeds\/42\/content/, reply: embedHtml() },
    { match: /\/document_downloads\/42/, reply: embedHtml() },
    { match: /\/pages\/1-/, reply: JSONP_MARKUP },
    { match: /\/images\//, reply: atlas }
  ]);
  const service = createScribdService({ transport });

  const preview = await service.preview({
    url: 'https://es.scribd.com/document/42/Prueba',
    limit: 3
  });

  assert.equal(preview.document.documentId, '42');
  assert.equal(preview.totalPages, 1);
  assert.equal(preview.pages.length, 1);
  assert.equal(preview.pages[0].pageNum, 1);
  assert.match(preview.pages[0].image, /^data:image\/jpeg;base64,/);

  const jpeg = Buffer.from(preview.pages[0].image.split(',')[1], 'base64');
  const metadata = await sharp(jpeg).metadata();
  assert.equal(metadata.width, 4);
  assert.equal(metadata.height, 3);
});

test('GET /api/scribd/preview valida la url antes de consultar Scribd', async () => {
  const { port, server } = await startServerForTest();
  try {
    const missing = await request({ port, path: '/api/scribd/preview' });
    assert.equal(missing.statusCode, 400);
    assert.equal(missing.body.success, false);

    const invalid = await request({
      port,
      path: `/api/scribd/preview?url=${encodeURIComponent('https://example.com/document/42')}`
    });
    assert.equal(invalid.statusCode, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
