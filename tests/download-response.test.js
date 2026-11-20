const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const {
  buildDownloadHeaders,
  sendGeneratedFile
} = require('../utils/fileResponse');

const app = require('../server/app.js');
const scribdService = require('../services/scribdService');

function createFakeResponse({ error = null } = {}) {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    download(filePath, fileName, callback) {
      this.downloaded = { filePath, fileName };
      if (callback) callback(error);
    }
  };
}

test('buildDownloadHeaders codifica los metadatos y omite campos vacíos', () => {
  const headers = buildDownloadHeaders({
    fileName: 'Presentación final.pdf',
    title: 'Título con acentos y símbolos: ñ & %',
    format: 'pdf',
    quality: 'hd',
    slideCount: 12,
    totalPages: 20,
    source: 'preview',
    warnings: ['aviso uno', 'aviso dos']
  });

  assert.equal(headers['X-Download-File-Name'], encodeURIComponent('Presentación final.pdf'));
  assert.equal(headers['X-Download-Title'], encodeURIComponent('Título con acentos y símbolos: ñ & %'));
  assert.equal(headers['X-Download-Format'], 'pdf');
  assert.equal(headers['X-Download-Quality'], 'hd');
  assert.equal(headers['X-Download-Slides'], '12');
  assert.equal(headers['X-Download-Total-Pages'], '20');
  assert.equal(headers['X-Download-Source'], 'preview');
  assert.equal(headers['X-Download-Warnings'], encodeURIComponent('aviso uno | aviso dos'));

  const empty = buildDownloadHeaders({ fileName: '', title: '', warnings: [] });
  assert.deepEqual(empty, {});
});

test('sendGeneratedFile transmite el archivo, envía cabeceras y limpia', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-file-response-'));
  const filePath = path.join(dir, 'salida.pdf');
  fs.writeFileSync(filePath, '%PDF-1.4');

  let cleaned = false;
  const res = createFakeResponse();

  try {
    sendGeneratedFile(res, {
      filePath,
      fileName: 'salida.pdf',
      title: 'Prueba',
      format: 'pdf',
      slideCount: 3,
      onCleanup: () => {
        cleaned = true;
      }
    });

    assert.equal(res.downloaded.filePath, filePath);
    assert.equal(res.downloaded.fileName, 'salida.pdf');
    assert.equal(res.headers['Content-Type'], 'application/pdf');
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(res.headers['X-Download-File-Name'], 'salida.pdf');
    assert.equal(res.headers['X-Download-Slides'], '3');
    assert.equal(cleaned, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sendGeneratedFile no permite nombres con rutas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-file-name-'));
  const filePath = path.join(dir, 'real.pdf');
  fs.writeFileSync(filePath, '%PDF-1.4');

  const res = createFakeResponse();

  try {
    sendGeneratedFile(res, {
      filePath,
      fileName: '../../evil.pdf',
      format: 'pdf'
    });

    assert.equal(res.downloaded.fileName, 'evil.pdf');
    assert.equal(res.headers['X-Download-File-Name'], 'evil.pdf');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sendGeneratedFile responde 404 si el archivo ya no existe', () => {
  const res = createFakeResponse({ error: Object.assign(new Error('no existe'), { code: 'ENOENT' }) });

  sendGeneratedFile(res, {
    filePath: path.join(os.tmpdir(), 'sd-inexistente', 'archivo.pdf'),
    fileName: 'archivo.pdf',
    format: 'pdf'
  });

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.success, false);
});

function startServerForTest() {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => resolve({ port: server.address().port, server }));
  });
}

test('POST /api/scribd/download envía el archivo y limpia el trabajo', async () => {
  const jobId = randomUUID();
  const jobDir = path.join(os.tmpdir(), jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const filePath = path.join(jobDir, 'documento.pdf');
  fs.writeFileSync(filePath, '%PDF-1.4\ndocumento de prueba\n');

  const originalDownload = scribdService.download;
  scribdService.download = async () => ({
    jobId,
    title: 'Documento de prueba',
    format: 'pdf',
    pageCount: 2,
    totalPages: 5,
    fileName: 'documento.pdf',
    filePath,
    warnings: ['aviso de prueba'],
    sourceUrl: 'https://www.scribd.com/document/123'
  });

  const { port, server } = await startServerForTest();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/scribd/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '198.51.100.99'
      },
      body: JSON.stringify({
        url: 'https://www.scribd.com/document/123',
        format: 'pdf'
      })
    });

    const payload = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.match(response.headers.get('content-disposition'), /documento\.pdf/);
    assert.equal(response.headers.get('x-download-slides'), '2');
    assert.equal(response.headers.get('x-download-total-pages'), '5');
    assert.match(response.headers.get('x-download-warnings'), /aviso/);
    assert.equal(payload.subarray(0, 5).toString(), '%PDF-');

    // La limpieza ocurre al cerrar la respuesta; esperar a que se complete.
    for (let attempt = 0; attempt < 20 && fs.existsSync(jobDir); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(fs.existsSync(jobDir), false);
  } finally {
    scribdService.download = originalDownload;
    server.close();
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
});

