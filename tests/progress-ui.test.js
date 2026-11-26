const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'style.css'), 'utf8');
const downloadUtils = fs.readFileSync(path.join(ROOT, 'public', 'download-utils.js'), 'utf8');

test('la portada muestra una barra de progreso accesible junto a la descarga', () => {
  assert.match(html, /id="download-progress" hidden/);
  assert.match(html, /id="download-progress-track"[^>]*role="progressbar"[^>]*aria-valuenow="0"/);
  assert.match(html, /id="download-progress-text"[^>]*aria-live="polite"/);
  assert.match(css, /\.download-progress\[hidden\] \{/);

  const noticeStart = html.indexOf('id="download-legal-notice"');
  const progressStart = html.indexOf('id="download-progress"');
  const buttonStart = html.indexOf('id="download-btn"');
  assert.ok(noticeStart < progressStart && progressStart < buttonStart);
});

test('la UI sondea el progreso sin bloquear la descarga binaria', () => {
  assert.match(appJs, /function createProgressId\(\)/);
  assert.match(appJs, /randomUUID/);
  assert.match(appJs, /getRandomValues\(new Uint8Array\(16\)\)/);
  assert.match(appJs, /buildDownloadPayload\(url, \{ progressId \}\)/);
  assert.match(appJs, /fetch\(`\/api\/progress\/\$\{encodeURIComponent\(activeProgressId\)\}`\)/);
  assert.match(appJs, /response\.status === 404/);
  assert.match(appJs, /stopDownloadProgressPolling\(\);\s*\n\s*setLoading\(false\)/);
  assert.match(appJs, /Descargando \$\{progress\.current \|\| 0\}\/\$\{progress\.total\}/);
  assert.match(appJs, /Generando \$\{String\(progress\.format \|\| currentFormat\)\.toUpperCase\(\)\}/);
});

test('el panel de progreso y los avisos no inyectan HTML', () => {
  assert.match(appJs, /downloadProgressText\.textContent/);
  assert.match(appJs, /downloadProgressBar\.style\.width/);
  assert.match(appJs, /downloadProgressTrack\.setAttribute\('aria-valuenow'/);
  assert.doesNotMatch(appJs, /downloadProgress[A-Za-z]*\.innerHTML/);
  assert.doesNotMatch(appJs, /statusDetail\.innerHTML/);
});

test('los avisos de fallos parciales llegan del servidor a la interfaz', () => {
  assert.match(downloadUtils, /X-Download-Failed-Slides/);
  assert.match(downloadUtils, /failedSlideCount:/);
  assert.match(appJs, /metadata\.failedSlideCount/);
  assert.match(appJs, /Descarga lista con avisos/);
  assert.match(appJs, /'Avisos',\s*\n\s*\(metadata\.warnings \|\| \[\]\)\.join\(' '\)/);
});

test('el modo background reutiliza las mismas etapas legibles', () => {
  assert.match(appJs, /job\.detail/);
  assert.match(appJs, /describeDownloadProgress\(\{ stage: job\.stage, format: currentFormat \}\)/);
});
