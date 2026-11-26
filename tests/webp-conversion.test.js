const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');

const {
  detectImageMime,
  normalizeImageBuffer,
  looksLikeTextOrDiagram,
  downloadImage
} = require('../services/slideshareService');

const SERVICE_PATH = path.join(__dirname, '..', 'services', 'slideshareService.js');

/** Diagrama plano: fondo blanco con barras oscuras, típico de una diapositiva. */
function createDiagramWebP() {
  const width = 640;
  const height = 480;
  const data = Buffer.alloc(width * height * 3, 255);

  const paint = (x0, y0, x1, y1) => {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const index = (y * width + x) * 3;
        data[index] = 17;
        data[index + 1] = 17;
        data[index + 2] = 17;
      }
    }
  };

  paint(40, 40, 600, 90);
  paint(40, 130, 420, 145);
  paint(40, 180, 520, 195);
  paint(40, 230, 300, 245);
  paint(40, 300, 560, 315);

  return sharp(data, { raw: { width, height, channels: 3 } })
    .webp({ lossless: true })
    .toBuffer();
}

/** Ruido RGB: mucha variedad de colores, como una fotografía. */
function createPhotoWebP() {
  const width = 320;
  const height = 240;
  const data = Buffer.alloc(width * height * 3);
  let seed = 987654321;

  for (let index = 0; index < data.length; index += 3) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[index] = seed & 0xff;
    data[index + 1] = (seed >>> 8) & 0xff;
    data[index + 2] = (seed >>> 16) & 0xff;
  }

  return sharp(data, { raw: { width, height, channels: 3 } })
    .webp({ quality: 85 })
    .toBuffer();
}

test('la heurística reconoce texto/diagrama y descarta una foto', async () => {
  const diagram = await createDiagramWebP();
  const photo = await createPhotoWebP();

  assert.equal(detectImageMime(diagram), 'image/webp');
  assert.equal(detectImageMime(photo), 'image/webp');
  assert.equal(await looksLikeTextOrDiagram(diagram), true);
  assert.equal(await looksLikeTextOrDiagram(photo), false);
});

test('un WebP de texto/diagrama pasa a PNG sin perder píxeles', async () => {
  const webp = await createDiagramWebP();
  const result = await normalizeImageBuffer(webp, { conversion: 'auto' });

  assert.equal(result.mime, 'image/png');

  const original = await sharp(webp).raw().toBuffer();
  const converted = await sharp(result.buffer).raw().toBuffer();
  assert.deepEqual(converted, original);
});

test('un WebP fotográfico pasa a JPEG', async () => {
  const webp = await createPhotoWebP();
  const result = await normalizeImageBuffer(webp, { conversion: 'auto' });

  assert.equal(result.mime, 'image/jpeg');
  assert.equal(detectImageMime(result.buffer), 'image/jpeg');
});

test('la calidad JPEG configurable cambia el tamaño del resultado', async () => {
  const webp = await createPhotoWebP();
  const low = await normalizeImageBuffer(webp, { jpegQuality: 35, conversion: 'jpeg' });
  const high = await normalizeImageBuffer(webp, { jpegQuality: 98, conversion: 'jpeg' });

  assert.equal(low.mime, 'image/jpeg');
  assert.equal(high.mime, 'image/jpeg');
  assert.ok(low.buffer.length < high.buffer.length);
});

test('JPEG_QUALITY del entorno se aplica al convertir WebP', async () => {
  // La imagen se pasa por stdin: en Windows los argumentos tienen un tope bajo.
  const script = `
    const { normalizeImageBuffer } = require(${JSON.stringify(SERVICE_PATH)});
    const input = Buffer.from(require('node:fs').readFileSync(0, 'utf8'), 'base64');
    normalizeImageBuffer(input, { conversion: 'jpeg' })
      .then((result) => process.stdout.write(String(result.buffer.length)));
  `;

  const base64 = (await createPhotoWebP()).toString('base64');
  const run = (quality) =>
    Number(
      execFileSync(process.execPath, ['-e', script], {
        env: { ...process.env, JPEG_QUALITY: String(quality) },
        encoding: 'utf8',
        input: base64
      })
    );

  assert.ok(run(40) < run(95));
});

test('WEBP_CONVERSION del entorno fuerza JPEG en un diagrama', async () => {
  const script = `
    const { normalizeImageBuffer } = require(${JSON.stringify(SERVICE_PATH)});
    const input = Buffer.from(require('node:fs').readFileSync(0, 'utf8'), 'base64');
    normalizeImageBuffer(input).then((result) => process.stdout.write(result.mime));
  `;

  const base64 = (await createDiagramWebP()).toString('base64');
  const mime = execFileSync(process.execPath, ['-e', script], {
    env: { ...process.env, WEBP_CONVERSION: 'jpeg' },
    encoding: 'utf8',
    input: base64
  });

  assert.equal(mime, 'image/jpeg');
});

test('los extremos de calidad JPEG (1 y 100) son válidos', async () => {
  const webp = await createPhotoWebP();
  const min = await normalizeImageBuffer(webp, { jpegQuality: 1, conversion: 'jpeg' });
  const max = await normalizeImageBuffer(webp, { jpegQuality: 100, conversion: 'jpeg' });

  assert.equal(min.mime, 'image/jpeg');
  assert.equal(max.mime, 'image/jpeg');
  assert.ok(min.buffer.length < max.buffer.length);
});

test('valores de configuración no válidos caen al default', async () => {
  const webp = await createPhotoWebP();
  const invalid = await normalizeImageBuffer(webp, {
    jpegQuality: 200,
    conversion: 'desconocido',
    pngMaxBytes: -1
  });
  const fallback = await normalizeImageBuffer(webp, {
    jpegQuality: 92,
    conversion: 'auto',
    pngMaxBytes: 8 * 1024 * 1024
  });

  assert.equal(invalid.mime, fallback.mime);
  assert.deepEqual(invalid.buffer, fallback.buffer);
});

test('el modo jpeg y el tope de bytes fuerzan JPEG aunque sea un diagrama', async () => {
  const webp = await createDiagramWebP();

  const forced = await normalizeImageBuffer(webp, { conversion: 'jpeg' });
  assert.equal(forced.mime, 'image/jpeg');

  const capped = await normalizeImageBuffer(webp, { conversion: 'png', pngMaxBytes: 16 });
  assert.equal(capped.mime, 'image/jpeg');
});

test('un WebP corrupto conserva su MIME y no lanza', async () => {
  const corrupt = Buffer.from('RIFF0000WEBPcontenido-no-valido');
  assert.equal(detectImageMime(corrupt), 'image/webp');

  const result = await normalizeImageBuffer(corrupt, { conversion: 'png' });
  assert.equal(result.mime, 'image/webp');
  assert.strictEqual(result.buffer, corrupt);
});

test('downloadImage entrega PNG desde un servidor local', async (t) => {
  const webp = await createDiagramWebP();
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'image/webp' });
    res.end(webp);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const url = `http://127.0.0.1:${server.address().port}/diagrama.webp`;
  const buffer = await downloadImage(url);

  assert.equal(detectImageMime(buffer), 'image/png');
});
