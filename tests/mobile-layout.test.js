const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'style.css'), 'utf8');

test('la vista previa ofrece un modo lista accesible solo en móvil', () => {
  assert.match(html, /id="preview-layout-btn"[^>]*aria-pressed="false"/);
  assert.match(css, /\.preview-layout-btn \{\s*\n\s*display: none;/);
  assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*\.preview-layout-btn \{[\s\S]*display: inline-flex;/);
  assert.match(css, /\.preview-grid--list \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.preview-grid--list \.preview-index \{[\s\S]*display: flex;/);
});

test('el modo lista se alterna y se recuerda sin inyectar HTML', () => {
  assert.match(appJs, /function togglePreviewLayout\(\)/);
  assert.match(appJs, /previewGrid\.classList\.toggle\('preview-grid--list'/);
  assert.match(appJs, /previewLayoutBtn\.setAttribute\('aria-pressed'/);
  assert.match(appJs, /writePreference\('previewLayout'/);
  assert.match(appJs, /readPreference\('previewLayout', 'grid'\)/);
  assert.match(appJs, /indexLabel\.textContent = String\(index \+ 1\)/);
  assert.doesNotMatch(appJs, /previewGrid\.innerHTML/);
  assert.doesNotMatch(appJs, /previewLayoutBtn\.innerHTML/);
});

test('las miniaturas siguen teniendo una alternativa textual', () => {
  assert.match(appJs, /image\.alt = `Diapositiva \$\{index \+ 1\}`/);
  assert.match(appJs, /image\.referrerPolicy = 'no-referrer'/);
});
