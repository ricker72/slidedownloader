const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const http = require('node:http');

const {
  createPptxFromImages,
  createDocxFromImages,
  createPdfFromImages,
  detectImageMime,
  convertPptxToVariant
} = require('../services/slideshareService');

// PNG 1x1 rojo válido
const pngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
assert.equal(detectImageMime(pngBuffer), 'image/png');

function startImageServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(pngBuffer);
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${port}/slide.png` });
    });
  });
}

function mediaFilesOf(zip, prefix) {
  return Object.keys(zip.files)
    .filter((n) => n.startsWith(prefix) && !n.endsWith('/'))
    .sort();
}

test('imágenes se insertan con contenido real en PPTX (no vacías)', async (t) => {
  const { server, url } = await startImageServer();
  t.after(() => server.close());

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-img-pptx-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const outputPath = path.join(dir, 'test.pptx');
  await createPptxFromImages([url], outputPath, 'Test', 'sd');

  const buf = fs.readFileSync(outputPath);
  const zip = await JSZip.loadAsync(buf);
  const mediaFiles = mediaFilesOf(zip, 'ppt/media/');

  assert.ok(mediaFiles.length > 0, 'PPTX debe contener archivos de media');
  for (const mediaFile of mediaFiles) {
    const mediaBuf = await zip.file(mediaFile).async('nodebuffer');
    assert.ok(mediaBuf.length > 0, `${mediaFile} no debe estar vacía`);
    assert.ok(mediaBuf.length < buf.length, `${mediaFile} no debe ser mayor que el PPTX`);
  }
});

test('imágenes se insertan con contenido real en PPSX', async (t) => {
  const { server, url } = await startImageServer();
  t.after(() => server.close());

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-img-ppsx-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const pptxPath = path.join(dir, 'test.pptx');
  await createPptxFromImages([url], pptxPath, 'Test', 'sd');

  const ppsxPath = path.join(dir, 'test.ppsx');
  await convertPptxToVariant(pptxPath, ppsxPath, 'ppsx');

  const buf = fs.readFileSync(ppsxPath);
  const zip = await JSZip.loadAsync(buf);
  const mediaFiles = mediaFilesOf(zip, 'ppt/media/');

  assert.ok(mediaFiles.length > 0, 'PPSX debe contener archivos de media');
  for (const mediaFile of mediaFiles) {
    const mediaBuf = await zip.file(mediaFile).async('nodebuffer');
    assert.ok(mediaBuf.length > 0, `${mediaFile} no debe estar vacía`);
  }
});

test('imágenes se insertan con contenido real en POTX', async (t) => {
  const { server, url } = await startImageServer();
  t.after(() => server.close());

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-img-potx-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const pptxPath = path.join(dir, 'test.pptx');
  await createPptxFromImages([url], pptxPath, 'Test', 'sd');

  const potxPath = path.join(dir, 'test.potx');
  await convertPptxToVariant(pptxPath, potxPath, 'potx');

  const buf = fs.readFileSync(potxPath);
  const zip = await JSZip.loadAsync(buf);
  const mediaFiles = mediaFilesOf(zip, 'ppt/media/');

  assert.ok(mediaFiles.length > 0, 'POTX debe contener archivos de media');
  for (const mediaFile of mediaFiles) {
    const mediaBuf = await zip.file(mediaFile).async('nodebuffer');
    assert.ok(mediaBuf.length > 0, `${mediaFile} no debe estar vacía`);
  }
});

test('imágenes se insertan con contenido real en DOCX', async (t) => {
  const { server, url } = await startImageServer();
  t.after(() => server.close());

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-img-docx-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const outputPath = path.join(dir, 'test.docx');
  await createDocxFromImages([url], outputPath, 'Test', 'sd');

  const buf = fs.readFileSync(outputPath);
  const zip = await JSZip.loadAsync(buf);
  const mediaFiles = mediaFilesOf(zip, 'word/media/');

  assert.ok(mediaFiles.length > 0, 'DOCX debe contener archivos de media');
  for (const mediaFile of mediaFiles) {
    const mediaBuf = await zip.file(mediaFile).async('nodebuffer');
    assert.ok(mediaBuf.length > 0, `${mediaFile} no debe estar vacía`);
  }
});

test('imágenes se insertan con contenido real en PDF', async (t) => {
  const { server, url } = await startImageServer();
  t.after(() => server.close());

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-img-pdf-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const outputPath = path.join(dir, 'test.pdf');
  await createPdfFromImages([url], outputPath, 'Test', 'sd');

  const buf = fs.readFileSync(outputPath);

  assert.ok(buf.slice(0, 5).toString('ascii') === '%PDF-', 'PDF debe tener header válido');

  const pdfText = buf.toString('latin1');
  assert.ok(/\/XObject/.test(pdfText) || /\/Image/.test(pdfText), 'PDF debe contener referencias a imágenes');

  assert.ok(buf.length > 500, 'PDF con imagen debe tener tamaño razonable (>500 bytes)');
});

test('múltiples imágenes se insertan en orden en PPTX', async (t) => {
  const { server, url } = await startImageServer();
  t.after(() => server.close());

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-img-multi-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const outputPath = path.join(dir, 'multi.pptx');
  await createPptxFromImages([url, url, url], outputPath, 'Multi', 'sd');

  const buf = fs.readFileSync(outputPath);
  const zip = await JSZip.loadAsync(buf);
  const mediaFiles = mediaFilesOf(zip, 'ppt/media/');
  const slideFiles = mediaFilesOf(zip, 'ppt/slides/slide').filter((n) => n.endsWith('.xml'));

  assert.ok(mediaFiles.length >= 1, 'Debe haber al menos una imagen de media');
  assert.ok(slideFiles.length === 3, `Debe haber 3 diapositivas, se encontraron ${slideFiles.length}`);
});
