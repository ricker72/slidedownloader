const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const PptxGenJS = require('pptxgenjs');

const { convertPptxToVariant } = require('../services/slideshareService');

const PPTX_MAIN =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml';
const PPSX_MAIN =
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml';
const POTX_MAIN =
  'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml';

async function createSamplePptx(outputPath) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  const slide = pptx.addSlide();
  slide.addText('Diapositiva de prueba', { x: 1, y: 1, w: 8, h: 1, fontSize: 24 });

  await pptx.writeFile({ fileName: outputPath });
}

async function readContentTypes(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  return zip.file('[Content_Types].xml').async('string');
}

test('convertPptxToVariant cambia el tipo de contenido a presentación y plantilla', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-variant-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const pptxPath = path.join(dir, 'sample.pptx');
  await createSamplePptx(pptxPath);

  const originalXml = await readContentTypes(pptxPath);
  assert.ok(originalXml.includes(PPTX_MAIN), 'el PPTX base debe declarar el tipo de presentación');

  const ppsxPath = path.join(dir, 'sample.ppsx');
  await convertPptxToVariant(pptxPath, ppsxPath, 'ppsx');
  const ppsxXml = await readContentTypes(ppsxPath);
  assert.ok(ppsxXml.includes(PPSX_MAIN), 'PPSX debe declarar el tipo slideshow');
  assert.ok(!ppsxXml.includes(PPTX_MAIN), 'PPSX no debe conservar el tipo presentation');

  const potxPath = path.join(dir, 'sample.potx');
  await convertPptxToVariant(pptxPath, potxPath, 'potx');
  const potxXml = await readContentTypes(potxPath);
  assert.ok(potxXml.includes(POTX_MAIN), 'POTX debe declarar el tipo template');
  assert.ok(!potxXml.includes(PPTX_MAIN), 'POTX no debe conservar el tipo presentation');
});

test('convertPptxToVariant rechaza variantes desconocidas', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-variant-bad-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const pptxPath = path.join(dir, 'sample.pptx');
  await createSamplePptx(pptxPath);

  await assert.rejects(
    () => convertPptxToVariant(pptxPath, path.join(dir, 'sample.ppt'), 'ppt'),
    /Variante de PowerPoint no soportada/
  );
});
