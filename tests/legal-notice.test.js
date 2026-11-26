const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const app = require('../server/app');

const ROOT = path.join(__dirname, '..');
const NOTICE_TEXT = 'Solo descargas contenido público del que tengas derechos.';

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

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

test('la portada muestra el aviso legal antes del botón de descarga', () => {
  const html = read(path.join('public', 'index.html'));
  const noticeStart = html.indexOf('<p class="legal-notice" id="download-legal-notice">');
  const buttonStart = html.indexOf('id="download-btn"');

  assert.ok(noticeStart >= 0, 'falta el bloque del aviso legal');
  assert.ok(buttonStart >= 0, 'falta el botón de descarga');
  assert.ok(noticeStart < buttonStart, 'el aviso debe aparecer antes del botón');

  const noticeEnd = html.indexOf('</p>', noticeStart);
  const notice = html.slice(noticeStart, noticeEnd);
  assert.ok(notice.includes(NOTICE_TEXT), 'el texto del aviso debe ser exacto');
  assert.match(notice, /<use href="#i-shield"\/>/);
  assert.doesNotMatch(notice, /\shidden[\s>]/);
});

test('el aviso de la portada no puede ser sobrescrito por app.js', () => {
  const appJs = read(path.join('public', 'app.js'));
  assert.doesNotMatch(appJs, /download-legal-notice/);
});

test('el servidor entrega la portada con el aviso legal antes del botón', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);

    const html = await response.text();
    assert.ok(html.includes(NOTICE_TEXT));
    assert.ok(
      html.indexOf('download-legal-notice') < html.indexOf('download-btn'),
      'el HTML servido debe mostrar el aviso antes del botón'
    );
  });
});

test('Scribd conserva su aviso y comparte estilos con la portada', () => {
  const scribdHtml = read(path.join('public', 'scribd.html'));
  assert.match(scribdHtml, /Descarga solo documentos públicos sobre los que tengas derechos\./);

  const css = read(path.join('public', 'style.css'));
  assert.match(css, /\.legal-notice,\r?\n\.scribd-notice \{/);
  assert.match(css, /\.legal-notice p,\r?\n\.legal-notice span,\r?\n\.scribd-notice p \{/);
});
