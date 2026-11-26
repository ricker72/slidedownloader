const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../server/app');
const { downloadPresentation } = require('../services/slideshareService');
const {
  ERROR_CODES,
  createServiceError,
  DownloadValidationError,
  toPublicError
} = require('../services/errors');

const SLIDE_URL = 'https://www.slideshare.net/slideshow/tema-de-prueba/123456789';

async function withServer(callback) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postJson(baseUrl, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('los endpoints conservan status y cuerpo exactos ante entradas inválidas', async () => {
  await withServer(async (baseUrl) => {
    const cases = [
      [
        '/api/inspect',
        { url: 'https://ejemplo.com/no-slideshare' },
        400,
        { success: false, error: 'URL inválida de SlideShare' }
      ],
      [
        '/api/prompt',
        { url: 'https://ejemplo.com/no-slideshare' },
        400,
        { success: false, error: 'URL inválida de SlideShare' }
      ],
      [
        '/api/download',
        {},
        400,
        { success: false, error: 'Se requiere una URL' }
      ],
      [
        '/api/download',
        { url: SLIDE_URL, format: 'exe' },
        400,
        {
          success: false,
          error: 'Formato no soportado. Formatos disponibles: pdf, pptx, ppsx, potx, docx, txt, md'
        }
      ],
      [
        '/api/download',
        { url: SLIDE_URL, quality: 'xx' },
        400,
        { success: false, error: 'Calidad no soportada. Opciones: sd, hd' }
      ]
    ];

    for (const [path, body, status, expected] of cases) {
      const response = await postJson(baseUrl, path, body);
      assert.equal(response.status, status, path);
      assert.deepEqual(await response.json(), expected, path);
    }

    const jobs = await fetch(`${baseUrl}/api/jobs`);
    assert.equal(jobs.status, 404);
    assert.deepEqual(await jobs.json(), { success: false, error: 'No encontrado' });

    const scribd = await fetch(`${baseUrl}/api/scribd/inspect`);
    assert.equal(scribd.status, 400);
    assert.deepEqual(await scribd.json(), {
      success: false,
      error: 'Se requiere el parámetro url con un enlace de Scribd'
    });
  });
});

test('el catálogo de errores conserva status, mensaje y código', () => {
  const error = createServiceError('La imagen es demasiado grande para convertirla.', 413, ERROR_CODES.IMAGE_TOO_LARGE);
  assert.equal(error.status, 413);
  assert.equal(error.code, 'IMAGE_TOO_LARGE');
  assert.deepEqual(toPublicError(error), {
    status: 413,
    message: 'La imagen es demasiado grande para convertirla.',
    code: 'IMAGE_TOO_LARGE'
  });

  const internal = createServiceError('Detalle interno de la base de datos', 500);
  assert.equal(toPublicError(internal, { isProduction: true }).message, 'Error interno del servidor');
  assert.equal(toPublicError(internal, { isProduction: false }).message, 'Detalle interno de la base de datos');
  assert.equal(toPublicError(internal, { isProduction: true, maskServerErrors: false }).message, 'Detalle interno de la base de datos');

  const validation = new DownloadValidationError('Se requiere una URL');
  assert.equal(validation.status, 400);
  assert.equal(validation.code, ERROR_CODES.DOWNLOAD_VALIDATION);
});

test('los errores de servicio conservan su status y mensaje público', async () => {
  await assert.rejects(
    () => downloadPresentation('https://ejemplo.com/no-slideshare', 'pdf', 'sd'),
    (error) => error.status === 400 && /URL inválida/.test(error.message)
  );

  await assert.rejects(
    () => downloadPresentation(SLIDE_URL, 'exe', 'sd'),
    (error) => error.status === 400 && /Formato no soportado/.test(error.message)
  );

  await assert.rejects(
    () => downloadPresentation(SLIDE_URL, 'pdf', 'ultra'),
    (error) => error.status === 400 && /Calidad no soportada/.test(error.message)
  );
});
