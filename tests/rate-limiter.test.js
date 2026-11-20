const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const {
  rateLimiter,
  resetRateLimitStores,
  pingLimiter,
  downloadLimiter
} = require('../middleware/rateLimiter');

const app = require('../server/app.js');

function invoke(limiter, ip = '203.0.113.10') {
  const headers = {};
  const res = {
    statusCode: 200,
    set(name, value) {
      headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };

  let passed = false;
  limiter({ ip, socket: {}, connection: {} }, res, () => {
    passed = true;
  });

  return { passed, statusCode: res.statusCode, body: res.body, headers };
}

test('cada limitador mantiene su propio contador por IP', () => {
  const first = rateLimiter({ windowMs: 60000, max: 2 });
  const second = rateLimiter({ windowMs: 60000, max: 5 });
  const ip = '198.51.100.1';

  assert.equal(invoke(first, ip).passed, true);
  assert.equal(invoke(first, ip).passed, true);

  const blocked = invoke(first, ip);
  assert.equal(blocked.passed, false);
  assert.equal(blocked.statusCode, 429);

  // El segundo limitador no debe haberse consumido con las peticiones del primero.
  const independent = invoke(second, ip);
  assert.equal(independent.passed, true);
  assert.equal(independent.statusCode, 200);
});

test('el contador se reinicia al terminar la ventana', async () => {
  const limiter = rateLimiter({ windowMs: 40, max: 1 });
  const ip = '198.51.100.2';

  assert.equal(invoke(limiter, ip).passed, true);
  assert.equal(invoke(limiter, ip).passed, false);

  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(invoke(limiter, ip).passed, true);
});

test('las IPs distintas no comparten contador', () => {
  const limiter = rateLimiter({ windowMs: 60000, max: 1 });

  assert.equal(invoke(limiter, '198.51.100.3').passed, true);
  assert.equal(invoke(limiter, '198.51.100.4').passed, true);
  assert.equal(invoke(limiter, '198.51.100.3').passed, false);
});

test('resetRateLimitStores vacía todos los contadores', () => {
  const limiter = rateLimiter({ windowMs: 60000, max: 1 });
  const ip = '198.51.100.5';

  assert.equal(invoke(limiter, ip).passed, true);
  assert.equal(invoke(limiter, ip).passed, false);

  resetRateLimitStores();

  assert.equal(invoke(limiter, ip).passed, true);
});

function startServerForTest() {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => resolve({ port: server.address().port, server }));
  });
}

function request({ port, method = 'GET', path = '/', body = null, headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: { 'Content-Type': 'application/json', ...headers }
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
          resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed, raw: data });
        });
      }
    );

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test('agotar /api/health no bloquea /api/download', async () => {
  resetRateLimitStores();

  const { port, server } = await startServerForTest();
  // IP propia para que la prueba no dependa de otros archivos de test.
  const ip = '198.51.100.77';

  try {
    for (let index = 0; index < 20; index += 1) {
      const health = await request({
        port,
        method: 'GET',
        path: '/api/health',
        headers: { 'X-Forwarded-For': ip }
      });
      assert.equal(health.statusCode, 200);
    }

    // Formato inválido: la petición debe llegar al handler (400), no morir en
    // el rate limiter de descargas (429).
    const download = await request({
      port,
      method: 'POST',
      path: '/api/download',
      body: { url: 'https://www.slideshare.net/slideshow/demo/123456', format: 'exe' },
      headers: { 'X-Forwarded-For': ip }
    });

    assert.equal(download.statusCode, 400);
    assert.match(download.body.error, /Formato no soportado/);
  } finally {
    server.close();
  }
});

test('los limitadores preconfigurados son instancias distintas', () => {
  assert.notEqual(pingLimiter, downloadLimiter);
});
