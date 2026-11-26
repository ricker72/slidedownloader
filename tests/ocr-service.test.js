const test = require('node:test');
const assert = require('node:assert/strict');

const { createOcrEngine, DEFAULT_LANG } = require('../services/ocrService');

function fakeSetup(overrides = {}) {
  const calls = { worker: [], recognize: [], download: [], terminated: 0 };

  const engine = createOcrEngine({
    enabled: true,
    lang: overrides.lang || 'eng',
    maxSlides: overrides.maxSlides == null ? 2 : overrides.maxSlides,
    timeoutMs: overrides.timeoutMs || 1000,
    cacheDir: '',
    downloadImage: overrides.downloadImage || (async (url) => {
      calls.download.push(url);
      return Buffer.from(url);
    }),
    createWorker: overrides.createWorker || (async (lang, oem, options) => {
      calls.worker.push({ lang, oem, options });
      return {
        async recognize(buffer) {
          calls.recognize.push(buffer.toString());
          if (buffer.toString().includes('falla')) throw new Error('OCR local falló');
          return { data: { text: `Texto de ${buffer.toString()}` } };
        },
        async terminate() {
          calls.terminated += 1;
        }
      };
    })
  });

  return { engine, calls };
}

test('OCR desactivado no carga el motor ni descarga imágenes', async () => {
  const { engine, calls } = fakeSetup();
  const disabled = createOcrEngine({
    enabled: false,
    downloadImage: engine.recognizeSlides,
    createWorker: () => { throw new Error('no debería llamarse'); }
  });

  assert.deepEqual(await disabled.recognizeSlides(['https://ejemplo.test/1.jpg']), []);
  assert.equal(calls.worker.length, 0);
  await disabled.terminate();
});

test('el OCR procesa las diapositivas en orden, respeta el tope y cierra el worker', async () => {
  const { engine, calls } = fakeSetup({ maxSlides: 2 });
  const urls = [
    'https://ejemplo.test/uno.jpg',
    'https://ejemplo.test/dos.jpg',
    'https://ejemplo.test/tres.jpg'
  ];

  const slides = await engine.recognizeSlides(urls);

  assert.equal(calls.worker.length, 1);
  assert.equal(calls.download.length, 2);
  assert.deepEqual(slides.map((slide) => slide.slide), [1, 2]);
  assert.deepEqual(slides.map((slide) => slide.text), [
    'Texto de https://ejemplo.test/uno.jpg',
    'Texto de https://ejemplo.test/dos.jpg'
  ]);

  await engine.terminate();
  assert.equal(calls.terminated, 1);
});

test('un idioma inválido cae al valor por defecto', async () => {
  const { engine, calls } = fakeSetup({ lang: '../ruta-rara' });
  await engine.recognizeSlides(['https://ejemplo.test/uno.jpg']);

  assert.equal(calls.worker[0].lang, DEFAULT_LANG);
  await engine.terminate();
});

test('un fallo en una diapositiva no aborta las demás', async () => {
  const { engine, calls } = fakeSetup();
  const slides = await engine.recognizeSlides([
    'https://ejemplo.test/falla.jpg',
    'https://ejemplo.test/bien.jpg'
  ]);

  assert.equal(slides.length, 2);
  assert.equal(slides[0].text, '');
  assert.match(slides[0].error, /diapositiva 1/i);
  assert.match(slides[1].text, /Texto de/);
  assert.equal(calls.recognize.length, 2);

  await engine.terminate();
});

test('un timeout se convierte en aviso de diapositiva', async () => {
  const { engine } = fakeSetup({
    timeoutMs: 1000,
    downloadImage: () => new Promise(() => {})
  });

  const slides = await engine.recognizeSlides(['https://ejemplo.test/lenta.jpg']);

  assert.equal(slides[0].text, '');
  assert.match(slides[0].error, /diapositiva 1/i);
  await engine.terminate();
});

test('si el motor no puede crearse, el error se propaga al llamador', async () => {
  const engine = createOcrEngine({
    enabled: true,
    downloadImage: async () => Buffer.from('x'),
    createWorker: async () => { throw new Error('sin modelo'); }
  });

  await assert.rejects(() => engine.recognizeSlides(['https://ejemplo.test/uno.jpg']), /sin modelo/);
  await engine.terminate();
});
