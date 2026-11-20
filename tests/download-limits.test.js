const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  MAX_IMAGE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
  downloadImage,
  downloadImagesConcurrently
} = require('../services/slideshareService');

// PNG 1x1 válido (68 bytes): suficiente para probar los topes.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function startImageServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': TINY_PNG.length });
      res.end(TINY_PNG);
    });

    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/slide.png` });
    });
  });
}

test('los topes de tamaño están configurados y son coherentes', () => {
  assert.ok(MAX_IMAGE_BYTES > 0);
  assert.ok(MAX_TOTAL_IMAGE_BYTES > MAX_IMAGE_BYTES);
});

test('downloadImage rechaza una imagen que supera maxBytes', async (t) => {
  const { server, url } = await startImageServer();
  t.after(() => server.close());

  await assert.rejects(
    downloadImage(url, 'sd', 32),
    (error) => error.status === 413 && error.code === 'IMAGE_TOO_LARGE'
  );
});

test('downloadImagesConcurrently corta al superar el total de bytes', async (t) => {
  const { server, url } = await startImageServer();
  t.after(() => server.close());

  await assert.rejects(
    downloadImagesConcurrently([url, url, url], 'sd', 2, 100),
    (error) => error.status === 413 && error.code === 'DECK_TOO_LARGE'
  );
});

test('downloadImagesConcurrently devuelve dimensiones y respeta el orden', async (t) => {
  const { server, url } = await startImageServer();
  t.after(() => server.close());

  const images = await downloadImagesConcurrently([url, url], 'sd', 2, 10 * 1024 * 1024);

  assert.equal(images.length, 2);
  assert.equal(images[0].width, 1);
  assert.equal(images[0].height, 1);
  assert.equal(images[1].url, url);
});
