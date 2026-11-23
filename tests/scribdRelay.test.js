const test = require('node:test');
const assert = require('node:assert/strict');

const { createRelayTransport } = require('../services/scribdService');

test('el transporte relay envía la URL y las cabeceras y lee la respuesta', async () => {
  const calls = [];
  const payload = Buffer.from('<html>página</html>');

  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      headers: new Headers({
        'x-upstream-status': '302',
        'x-upstream-headers': JSON.stringify({ location: 'https://es.scribd.com/embeds/1/content' })
      }),
      arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)
    };
  };

  const transport = createRelayTransport({
    url: 'https://relay.example.com/',
    secret: 'secreto-de-prueba',
    fetchImpl
  });

  const result = await transport('https://www.scribd.com/document_downloads/1', {
    headers: { 'User-Agent': 'Chrome', Referer: 'https://www.scribd.com/' },
    maxBytes: 1024
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://relay.example.com/fetch?url=https%3A%2F%2Fwww.scribd.com%2Fdocument_downloads%2F1'
  );
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secreto-de-prueba');
  assert.deepEqual(JSON.parse(calls[0].options.headers['X-Scribd-Headers']), {
    'User-Agent': 'Chrome',
    Referer: 'https://www.scribd.com/'
  });
  assert.equal(result.status, 302);
  assert.deepEqual(result.headers, { location: 'https://es.scribd.com/embeds/1/content' });
  assert.deepEqual(result.buffer, payload);
});

test('el transporte relay convierte errores del relay en error del servicio', async () => {
  const transport = createRelayTransport({
    url: 'https://relay.example.com',
    secret: 'secreto',
    fetchImpl: async () => ({ ok: false, status: 401 })
  });

  await assert.rejects(
    transport('https://www.scribd.com/embeds/1/content'),
    (error) => error.status === 502 && /relay/i.test(error.message)
  );
});

test('el transporte relay exige URL y secreto', () => {
  assert.throws(
    () => createRelayTransport({ url: '', secret: 'secreto' }),
    (error) => error.status === 500
  );
  assert.throws(
    () => createRelayTransport({ url: 'https://relay.example.com', secret: '' }),
    (error) => error.status === 500
  );
});
