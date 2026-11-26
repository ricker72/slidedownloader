const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'style.css'), 'utf8');

test('la portada muestra el historial solo cuando hay entradas', () => {
  assert.match(html, /id="recent-section"[^>]*hidden/);
  assert.match(html, /id="recent-title">Descargas recientes/);
  assert.match(html, /id="recent-list"/);
  assert.match(html, /id="recent-clear-btn"[^>]*>Borrar historial/);
  assert.match(html, /<script src="local-state\.js\?v=1"><\/script>/);
  assert.match(css, /\.recent-section\[hidden\] \{/);
});

test('el historial se guarda tras una descarga correcta', () => {
  assert.match(appJs, /rememberDownload\(metadata, fileName\)/);
  assert.match(appJs, /SlideDownloaderLocalState\?\.addRecent\(\{/);
  assert.match(appJs, /slideCount: metadata\.slideCount/);
  assert.match(appJs, /renderRecentHistory\(entries\)/);
  assert.match(appJs, /clearRecentHistory\(\)/);
});

test('el historial no inyecta HTML y solo rellena el formulario', () => {
  assert.match(appJs, /recentList\.textContent = ''/);
  assert.match(appJs, /title\.textContent = entry\.title/);
  assert.match(appJs, /meta\.textContent =/);
  assert.match(appJs, /urlInput\.value = entry\.url/);
  assert.match(appJs, /inspectUrl\(entry\.url\)/);
  assert.doesNotMatch(appJs, /recentList\.innerHTML/);
  assert.doesNotMatch(appJs, /recentSection\.innerHTML/);
  assert.doesNotMatch(appJs, /recent[A-Za-z]*\.insertAdjacentHTML/);
});
