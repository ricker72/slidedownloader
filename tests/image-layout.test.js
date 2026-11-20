const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const JSZip = require('jszip');
const sharp = require('sharp');

const {
  createPptxFromImages,
  createDocxFromImages,
  fitImageWithinBox,
  getImageDimensions
} = require('../services/slideshareService');

const BOX = { x: 0.5, y: 0.8, w: 12.33, h: 6.5 };

test('fitImageWithinBox conserva la proporción 4:3 y centra la imagen', () => {
  const placement = fitImageWithinBox(400, 300, BOX);

  assert.ok(Math.abs(placement.w / placement.h - 4 / 3) < 0.001);
  assert.ok(Math.abs(placement.h - BOX.h) < 0.001, 'debe usar toda la altura disponible');
  assert.ok(Math.abs((placement.x - BOX.x) - (BOX.w - placement.w) / 2) < 0.001);
  assert.ok(Math.abs((placement.y - BOX.y) - (BOX.h - placement.h) / 2) < 0.001);
});

test('fitImageWithinBox conserva la proporción 16:9 y centra horizontalmente', () => {
  const placement = fitImageWithinBox(1920, 1080, BOX);

  assert.ok(Math.abs(placement.w / placement.h - 16 / 9) < 0.001);
  assert.ok(Math.abs(placement.h - BOX.h) < 0.001, 'debe usar toda la altura disponible');
  assert.ok(placement.x > BOX.x);
});

test('fitImageWithinBox devuelve la caja completa si no hay dimensiones', () => {
  assert.deepEqual(fitImageWithinBox(null, null, BOX), { x: BOX.x, y: BOX.y, w: BOX.w, h: BOX.h });
  assert.deepEqual(fitImageWithinBox(0, 300, BOX), { x: BOX.x, y: BOX.y, w: BOX.w, h: BOX.h });
});

test('getImageDimensions lee el tamaño real de un PNG', async () => {
  const png = await sharp({
    create: { width: 400, height: 300, channels: 3, background: '#336699' }
  }).png().toBuffer();

  assert.deepEqual(await getImageDimensions(png), { width: 400, height: 300 });
});

test('createPptxFromImages inserta una imagen 4:3 sin deformarla', async (t) => {
  const png = await sharp({
    create: { width: 400, height: 300, channels: 3, background: '#336699' }
  }).png().toBuffer();

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(png);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-aspect-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const outputPath = path.join(dir, 'aspecto.pptx');
  const { port } = server.address();

  await createPptxFromImages([`http://127.0.0.1:${port}/slide-1.png`], outputPath, 'Aspecto', 'sd');

  const zip = await JSZip.loadAsync(fs.readFileSync(outputPath));
  const slideXml = await zip.file('ppt/slides/slide1.xml').async('string');
  const picture = slideXml.match(/<p:pic>[\s\S]*?<\/p:pic>/);

  assert.ok(picture, 'la diapositiva debe contener una imagen');

  const extent = picture[0].match(/<a:ext cx="(\d+)" cy="(\d+)"/);
  assert.ok(extent, 'la imagen debe tener un tamaño explícito');

  const ratio = Number(extent[1]) / Number(extent[2]);
  assert.ok(Math.abs(ratio - 4 / 3) < 0.02, `la imagen se deformó: ratio ${ratio}`);
});

test('createDocxFromImages inserta una imagen 4:3 sin deformarla', async (t) => {
  const png = await sharp({
    create: { width: 400, height: 300, channels: 3, background: '#996633' }
  }).png().toBuffer();

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(png);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-aspect-docx-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const outputPath = path.join(dir, 'aspecto.docx');
  const { port } = server.address();

  await createDocxFromImages([`http://127.0.0.1:${port}/slide-1.png`], outputPath, 'Aspecto', 'sd');

  const zip = await JSZip.loadAsync(fs.readFileSync(outputPath));
  const documentXml = await zip.file('word/document.xml').async('string');
  const extent = documentXml.match(/<wp:extent cx="(\d+)" cy="(\d+)"/);

  assert.ok(extent, 'el documento debe contener una imagen con tamaño explícito');

  const ratio = Number(extent[1]) / Number(extent[2]);
  assert.ok(Math.abs(ratio - 4 / 3) < 0.02, `la imagen se deformó: ratio ${ratio}`);
});
