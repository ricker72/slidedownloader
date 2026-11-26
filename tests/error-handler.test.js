const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { ERROR_CODES, createServiceError } = require('../services/errors');
const { sendError, errorHandler } = require('../middleware/errorHandler');

async function withServer(app, callback) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

function appWith(handler) {
  const app = express();
  app.get('/', handler);
  app.use(errorHandler);
  return app;
}

test('sendError conserva el cuerpo y expone solo códigos del catálogo', async () => {
  const app = appWith((req, res) => sendError(
    res,
    createServiceError('La imagen es demasiado grande para convertirla.', 413, ERROR_CODES.IMAGE_TOO_LARGE),
    { log: false }
  ));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(baseUrl);
    assert.equal(response.status, 413);
    assert.equal(response.headers.get('x-error-code'), 'IMAGE_TOO_LARGE');
    assert.deepEqual(await response.json(), {
      success: false,
      error: 'La imagen es demasiado grande para convertirla.'
    });
  });
});

test('sendError enmascara 5xx en producción pero nunca 4xx', async () => {
  const previous = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = 'production';
    const app = appWith((req, res) => {
      if (req.query.status === '400') {
        return sendError(res, createServiceError('URL inválida de SlideShare', 400, ERROR_CODES.INVALID_URL));
      }
      return sendError(res, createServiceError('ruta/interna/secreta', 500));
    });

    await withServer(app, async (baseUrl) => {
      const clientError = await fetch(`${baseUrl}?status=400`);
      assert.equal(clientError.status, 400);
      assert.deepEqual(await clientError.json(), {
        success: false,
        error: 'URL inválida de SlideShare'
      });

      const serverError = await fetch(baseUrl);
      assert.equal(serverError.status, 500);
      assert.deepEqual(await serverError.json(), {
        success: false,
        error: 'Error interno del servidor'
      });
      assert.equal(serverError.headers.get('x-error-code'), null);
    });
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('errorHandler recoge errores pasados por next con la misma forma JSON', async () => {
  const app = appWith((req, res, next) => {
    next(createServiceError('No se pudo inspeccionar la presentación.', 503, ERROR_CODES.INSPECTION_FAILED));
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(baseUrl);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('x-error-code'), 'INSPECTION_FAILED');
    assert.deepEqual(await response.json(), {
      success: false,
      error: 'No se pudo inspeccionar la presentación.'
    });
  });
});
