const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const styleCss = fs.readFileSync(path.join(ROOT, 'public', 'style.css'), 'utf8');

test('la UI sólo ofrece trabajos en background cuando el servidor lo habilita', () => {
  assert.match(html, /id="background-btn"[^>]*hidden/);
  assert.match(html, /id="job-controls"[^>]*hidden/);
  assert.match(html, /id="job-progress"[^>]*aria-live="polite"[^>]*><\/p>/);
  assert.match(appJs, /backgroundBtn\.hidden = !jobsEnabled/);
  assert.match(appJs, /jobsEnabled = limits\.jobsEnabled === true/);
});

test('la UI encola, sondea con backoff y muestra el enlace de descarga', () => {
  assert.match(appJs, /fetch\('\/api\/jobs'/);
  assert.match(appJs, /function pollJob\(/);
  assert.match(appJs, /JOB_POLL_INITIAL_MS/);
  assert.match(appJs, /JOB_POLL_MAX_MS/);
  assert.match(appJs, /job\.status === 'done'/);
  assert.match(appJs, /result\.downloadUrl\.startsWith\('\/api\/jobs\/'\)/);
  assert.match(appJs, /link\.textContent = 'Descargar archivo generado'/);
  assert.match(appJs, /link\.focus\(\)/);
  assert.match(appJs, /function stopJobPolling\(/);
  assert.match(appJs, /function nextPollDelay\(/);
  assert.match(appJs, /failures < 2/);
  assert.match(appJs, /jobCancelBtn\.addEventListener\('click', cancelJobPolling\)/);
  assert.match(appJs, /backgroundBtn\.disabled = false/);
});

test('el panel de trabajos no inyecta HTML', () => {
  assert.match(appJs, /jobProgress\.textContent/);
  assert.match(appJs, /actionNoteText\.textContent/);
  assert.doesNotMatch(appJs, /jobProgress\.innerHTML/);
  assert.doesNotMatch(appJs, /statusDetail\.innerHTML/);
  assert.doesNotMatch(appJs, /backgroundBtn\.insertAdjacentHTML/);
  assert.match(styleCss, /\.job-progress:empty/);
  assert.match(styleCss, /\.job-controls\[hidden\]/);
  assert.match(styleCss, /\.btn-secondary/);
});
