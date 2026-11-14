const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { createPptxFromImages, detectImageMime } = require('../services/slideshareService');

// PNG 1x1 rojo
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test('detectImageMime identifica PNG y JPEG, y rechaza contenido desconocido', () => {
  assert.equal(detectImageMime(PNG), 'image/png');
  assert.equal(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'image/jpeg');
  assert.equal(detectImageMime(Buffer.from('<html>no soy una imagen</html>')), null);
});

test('createPptxFromImages incrusta las imágenes en el archivo PPTX', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(PNG);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const outputPath = path.join(os.tmpdir(), `slidedownloader-pptx-${process.pid}.pptx`);

  try {
    await createPptxFromImages(
      [`http://127.0.0.1:${port}/slide-1.png`, `http://127.0.0.1:${port}/slide-2.png`],
      outputPath,
      'Prueba'
    );

    const bytes = fs.readFileSync(outputPath);
    // Los nombres del directorio central del ZIP se guardan sin comprimir.
    const raw = bytes.toString('latin1');
    const mediaEntries = raw.match(/ppt\/media\/image[A-Za-z0-9._-]{0,40}\.(?:png|jpe?g)/g) || [];

    assert.ok(bytes.length > 1000, 'el PPTX generado no debería estar vacío');
    assert.ok(mediaEntries.length >= 2, `se esperaban al menos 2 imágenes incrustadas, hay ${mediaEntries.length}`);
  } finally {
    server.close();
    fs.rmSync(outputPath, { force: true });
  }
});
