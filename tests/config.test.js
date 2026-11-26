const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const config = require('../config');
const { getLimits: getFacadeLimits } = require('../services/slideshareService');

test('config expone los límites vigentes y la fachada los reexporta', () => {
  assert.deepEqual(config.getLimits(), getFacadeLimits());
  assert.deepEqual(Object.keys(config.getLimits()).sort(), [
    'bytesPerSlide',
    'imageConcurrency',
    'maxDownloadMs',
    'maxImageBytes',
    'maxSlides',
    'maxTotalImageBytes',
    'previewLimit',
    'webpConversion'
  ].sort());
});

test('getLimits devuelve copias defensivas del snapshot', () => {
  const first = config.getLimits();
  first.maxSlides = 1;
  first.bytesPerSlide.hd = 1;
  first.webpConversion.mode = 'png';

  const second = config.getLimits();
  assert.notEqual(second.maxSlides, 1);
  assert.notEqual(second.bytesPerSlide.hd, 1);
  assert.notEqual(second.webpConversion.mode, 'png');
});

test('getRuntime lee en vivo banderas, URLs y entorno', () => {
  const previous = {
    OCR_ENABLED: process.env.OCR_ENABLED,
    RENDERER_URL: process.env.RENDERER_URL,
    NODE_ENV: process.env.NODE_ENV,
    JOB_TTL_MS: process.env.JOB_TTL_MS
  };

  try {
    process.env.OCR_ENABLED = 'true';
    process.env.RENDERER_URL = 'http://renderer-de-prueba.local';
    process.env.NODE_ENV = 'production';
    process.env.JOB_TTL_MS = '0';

    const runtime = config.getRuntime();
    assert.equal(runtime.ocrEnabled, true);
    assert.equal(runtime.rendererUrl, 'http://renderer-de-prueba.local');
    assert.equal(runtime.isProduction, true);
    assert.equal(runtime.jobTtlMs, 0);

    delete process.env.OCR_ENABLED;
    assert.equal(config.getRuntime().ocrEnabled, false);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('las rutas y constantes respetan el perfil local', () => {
  assert.ok(['local', 'vercel'].includes(config.profile));
  assert.equal(config.DEFAULT_TITLE, 'presentacion');
  assert.deepEqual(config.SUPPORTED_FORMATS, ['pdf', 'pptx', 'ppsx', 'potx', 'docx', 'txt', 'md']);
  assert.equal(config.USER_AGENTS.length, 3);
  assert.equal(
    config.DOWNLOADS_DIR,
    config.isVercel
      ? path.join('/tmp', 'slidedownloader-downloads')
      : path.join(__dirname, '..', 'downloads')
  );
});
