const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DownloadValidationError,
  validateDownloadRequest,
  generateDownload
} = require('../services/downloadService');

const VALID_URL = 'https://www.slideshare.net/slideshow/ejemplo/12345678';

test('validateDownloadRequest normaliza URL, formato y calidad por defecto', () => {
  const request = validateDownloadRequest({ url: VALID_URL });

  assert.equal(request.url, VALID_URL);
  assert.equal(request.format, 'pdf');
  assert.equal(request.quality, 'sd');
});

test('validateDownloadRequest conserva los mensajes de error del controlador original', () => {
  assert.throws(() => validateDownloadRequest({}), {
    name: 'DownloadValidationError',
    status: 400,
    message: 'Se requiere una URL'
  });

  assert.throws(() => validateDownloadRequest({ url: 'https://example.com/no' }), {
    name: 'DownloadValidationError',
    message: 'URL inválida de SlideShare'
  });

  assert.throws(
    () => validateDownloadRequest({ url: VALID_URL, format: 'exe' }),
    (error) => error instanceof DownloadValidationError
      && error.status === 400
      && /^Formato no soportado\. Formatos disponibles: /.test(error.message)
  );

  assert.throws(() => validateDownloadRequest({ url: VALID_URL, quality: '4k' }), {
    name: 'DownloadValidationError',
    message: 'Calidad no soportada. Opciones: sd, hd'
  });
});

test('generateDownload usa la inspección cacheada y reutiliza las imágenes explícitas', async () => {
  const calls = [];
  const cached = { title: 'Título cacheado', previewImages: ['https://img/1.webp'] };
  const generate = async (url, format, quality, options) => {
    calls.push({ url, format, quality, options });
    return { filePath: '/tmp/archivo.pdf' };
  };

  const result = await generateDownload(
    { url: VALID_URL, format: 'PPTX', quality: 'HD' },
    { generate, getCachedInspection: () => cached }
  );

  assert.equal(result.filePath, '/tmp/archivo.pdf');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    url: VALID_URL,
    format: 'pptx',
    quality: 'hd',
    options: { imageUrls: cached.previewImages, title: cached.title }
  });

  const explicit = ['https://img/explicita.webp'];
  await generateDownload(
    { url: VALID_URL, imageUrls: explicit, title: 'Título propio' },
    { generate, getCachedInspection: () => cached }
  );

  assert.deepEqual(calls[1].options, { imageUrls: explicit, title: 'Título propio' });
});

test('generateDownload funciona sin caché, como lo hará el worker', async () => {
  let received;
  const generate = async (url, format, quality, options) => {
    received = { url, format, quality, options };
    return { filePath: '/tmp/sin-cache.pdf' };
  };

  await generateDownload({ url: VALID_URL }, { generate });

  assert.deepEqual(received.options, { imageUrls: undefined, title: undefined });
});
