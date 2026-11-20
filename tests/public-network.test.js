const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const {
  isBlockedIp,
  isBlockedHostname,
  assertPublicHost,
  openPublicResponse
} = require('../utils/publicNetwork');

const app = require('../server/app.js');

test('isBlockedIp bloquea loopback, privadas, CGNAT y rangos reservados', () => {
  const blocked = [
    '127.0.0.1',
    '10.1.2.3',
    '100.64.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.10',
    '198.18.0.1',
    '198.19.255.255',
    '203.0.113.9',
    '0.0.0.0',
    '224.0.0.1',
    '240.0.0.1',
    '::1',
    '::',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    'fd00::1',
    'fe80::1',
    '2001:db8::1',
    '2002::1',
    'ff02::1'
  ];

  for (const address of blocked) {
    assert.equal(isBlockedIp(address), true, `debería bloquear ${address}`);
  }

  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
    assert.equal(isBlockedIp(address), false, `no debería bloquear ${address}`);
  }
});

test('isBlockedHostname bloquea nombres locales y literales privados', () => {
  for (const host of ['localhost', 'foo.localhost', 'foo.local', 'metadata.google.internal', '127.0.0.1', '[::ffff:127.0.0.1]']) {
    assert.equal(isBlockedHostname(host), true, `debería bloquear ${host}`);
  }

  assert.equal(isBlockedHostname('example.com'), false);
  assert.equal(isBlockedHostname('slideshare.net'), false);
});

test('assertPublicHost lanza EBLOCKED para destinos no públicos', () => {
  assert.throws(() => assertPublicHost('127.0.0.1'), (error) => error.code === 'EBLOCKED');
  assert.throws(() => assertPublicHost('localhost'), (error) => error.code === 'EBLOCKED');
  assert.doesNotThrow(() => assertPublicHost('example.com'));
});

test('openPublicResponse rechaza destinos privados sin abrir conexión', async () => {
  for (const url of ['http://127.0.0.1/x.pdf', 'http://[::ffff:127.0.0.1]/x.pdf', 'http://100.64.0.1/x.pdf']) {
    await assert.rejects(openPublicResponse(url, { timeoutMs: 1000 }), (error) => error.code === 'EBLOCKED');
  }
});

function startServerForTest() {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => resolve({ port: server.address().port, server }));
  });
}

function request({ port, path = '/', headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'GET', headers },
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
    req.end();
  });
}

test('GET /api/file rechaza destinos internos y esquemas no permitidos', async () => {
  const { port, server } = await startServerForTest();
  const forwarded = { 'X-Forwarded-For': '198.51.100.123' };

  try {
    const urls = [
      'http://127.0.0.1/secreto.pdf',
      'http://[::ffff:127.0.0.1]/secreto.pdf',
      'http://169.254.169.254/latest/meta-data.pdf',
      'http://100.64.0.1/archivo.pdf',
      'ftp://example.com/archivo.pdf',
      'https://example.com/archivo.exe'
    ];

    for (const value of urls) {
      const res = await request({
        port,
        path: `/api/file?url=${encodeURIComponent(value)}`,
        headers: forwarded
      });

      assert.equal(res.statusCode, 400, `debería rechazar ${value}`);
      assert.equal(res.body.success, false);
    }

    assert.equal(server.listening, true);
  } finally {
    server.close();
  }
});
