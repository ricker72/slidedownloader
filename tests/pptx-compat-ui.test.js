const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const homeHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(ROOT, 'public', 'style.css'), 'utf8');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

test('la portada explica que el PPTX es compatible con Google Slides y Keynote', () => {
  assert.match(homeHtml, /style\.css\?v=26/);

  const note = homeHtml.match(/<p class="format-compat-note">[\s\S]*?<\/p>/);
  assert.ok(note, 'falta la nota de compatibilidad PPTX');
  assert.match(note[0], /Google Slides/);
  assert.match(note[0], /Keynote/);
  assert.match(note[0], /sin conversiones adicionales/);
  assert.match(note[0], /support\.google\.com\/docs\/answer\/9310378/);
  assert.match(note[0], /support\.apple\.com\/guide\/keynote\//);
  assert.equal(
    (note[0].match(/target="_blank" rel="noopener noreferrer"/g) || []).length,
    2
  );
});

test('la nota de compatibilidad tiene estilo propio', () => {
  assert.match(styleCss, /\.format-compat-note \{\s*\n\s*margin: 10px 0 0;/);
  assert.match(styleCss, /\.format-compat-note a \{\s*\n\s*color: var\(--brand\);/);
  assert.match(styleCss, /\.format-compat-note a \{[\s\S]*?text-underline-offset: 2px;/);
});

test('README aclara que no hay export nativo a Keynote ni subida a Drive', () => {
  assert.match(readme, /se puede abrir directamente en \*\*Google Slides\*\* y en \*\*Keynote\*\*/);
  assert.match(readme, /No se genera un `\.key` nativo ni se sube el archivo a Google Drive/);
});
