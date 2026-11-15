const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const {
  normalizeSlideShareUrl,
  sanitizeFileName,
  sanitizeProvidedImageUrls,
  selectSlideImages
} = require('../services/slideshareService');

const app = require('../server/app.js');

function startServerForTest() {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      resolve({ port, server });
    });
  });
}

function request({ port, method = 'GET', path = '/', body = null, headers = {} }) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: { 'Content-Type': 'application/json', ...headers }
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test('normalizeSlideShareUrl rechaza dominios no SlideShare', () => {
  assert.equal(normalizeSlideShareUrl('https://example.com/test'), null);
  assert.equal(normalizeSlideShareUrl('http://localhost/slideshow'), null);
  assert.equal(normalizeSlideShareUrl('https://127.0.0.1/slideshow'), null);
  assert.equal(normalizeSlideShareUrl('https://slideshare.evil.com/x'), null);
});

test('normalizeSlideShareUrl acepta URLs válidas de SlideShare', () => {
  const normalized = normalizeSlideShareUrl('slideshare.net/slideshow/foo/123456');
  assert.equal(normalized, 'https://slideshare.net/slideshow/foo/123456');
});

test('sanitizeFileName bloquea caracteres de path traversal', () => {
  const result = sanitizeFileName('../../../etc/passwd', 'pdf');
  assert.notEqual(result.includes('..'), true);
  assert.notEqual(result.includes('/'), true);
  assert.equal(result.endsWith('.pdf'), true);
});

test('sanitizeFileName elimina caracteres peligrosos', () => {
  const result = sanitizeFileName('mi|archivo:name<con>caracteres', 'pptx');
  assert.equal(result.includes('|'), false);
  assert.equal(result.includes(':'), false);
  assert.equal(result.includes('<'), false);
  assert.equal(result.includes('>'), false);
  assert.equal(result.endsWith('.pptx'), true);
});

test('sanitizeProvidedImageUrls solo acepta URLs de slidesharecdn.com', () => {
  const urls = [
    'https://image.slidesharecdn.com/deck/1/slide-1-320.jpg',
    'https://evil.com/shell.sh',
    'https://image.slidesharecdn.com/deck/2/slide-2-638.jpg',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    null,
    undefined,
    123
  ];
  const result = sanitizeProvidedImageUrls(urls);
  assert.equal(result.length, 2);
  assert.equal(result[0], 'https://image.slidesharecdn.com/deck/1/slide-1-320.jpg');
  assert.equal(result[1], 'https://image.slidesharecdn.com/deck/2/slide-2-638.jpg');
});

test('selectSlideImages descarga máximo MAX_SLIDES diapositivas', () => {
  const base = 'https://image.slidesharecdn.com/deck-123/85/Deck-';
  const urls = [];
  for (let i = 1; i <= 250; i++) {
    urls.push(`${base}${i}-320.jpg`);
  }
  const result = selectSlideImages(urls);
  assert.equal(result.length, 200);
});

test('CORS no permite origen wildcard arbitrario', async () => {
  const { port, server } = await startServerForTest();
  try {
    const res = await request({
      port,
      method: 'OPTIONS',
      path: '/api/health',
      headers: { Origin: 'https://sitio-malicioso.com' }
    });
    const acao = res.headers['access-control-allow-origin'];
    assert.notEqual(acao, '*');
    assert.notEqual(acao, 'https://sitio-malicioso.com');
  } finally {
    server.close();
  }
});

test('Rate limiting retorna 429 tras exceder el límite', async () => {
  const { port, server } = await startServerForTest();
  try {
    let rateLimited = false;
    for (let i = 0; i < 65; i++) {
      const res = await request({ port, method: 'GET', path: '/api/health' });
      if (res.statusCode === 429) {
        rateLimited = true;
        break;
      }
    }
    assert.equal(rateLimited, true, 'Se esperaba respuesta 429 por rate limiting');
  } finally {
    server.close();
  }
});

test('jobId inválido en descarga retorna 400', async () => {
  const { port, server } = await startServerForTest();
  try {
    const res1 = await request({ port, method: 'GET', path: '/download/../../../etc/passwd/fake.pdf' });
    assert.equal(res1.statusCode, 400);

    const res2 = await request({ port, method: 'GET', path: '/download/not-a-uuid/fake.pdf' });
    assert.equal(res2.statusCode, 400);
  } finally {
    server.close();
  }
});

test('Errores 500 no exponen mensajes internos en producción', async () => {
  const { port, server } = await startServerForTest();
  try {
    const res = await request({
      port,
      method: 'POST',
      path: '/api/download',
      body: { url: 'not-a-url' }
    });
    const bodyStr = JSON.stringify(res.body);
    assert.equal(bodyStr.includes('Error'), false);
    assert.equal(bodyStr.includes('at '), false);
    assert.equal(bodyStr.includes('/'), false);
  } finally {
    server.close();
  }
});

test('downloadImage rechaza URLs no remotas HTTP', async () => {
  const { downloadImage } = require('../services/slideshareService');
  await assert.rejects(
    downloadImage('file:///etc/passwd'),
    /URL de recurso no permitida/
  );
  await assert.rejects(
    downloadImage('data:text/html,<script>alert(1)</script>'),
    /URL de recurso no permitida/
  );
});