const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const read = (file) => fs.readFileSync(path.join(publicDir, file), 'utf8');

const innerPages = ['scribd.html', 'ai.html', 'google.html'];

test('las páginas interiores ya no llevan banner', () => {
  for (const page of innerPages) {
    const html = read(page);

    assert.match(html, /<body class="page-no-banner">/, `${page}: falta la clase page-no-banner`);
    assert.doesNotMatch(html, /hero-header|page-banner|hero-content/, `${page}: queda el banner`);
    assert.doesNotMatch(html, /banner-toggle/, `${page}: queda el botón del banner`);
    assert.doesNotMatch(html, /banner\.js/, `${page}: todavía carga banner.js`);
    assert.match(html, /class="topbar-shell"/, `${page}: debe conservar la barra de navegación`);
  }
});

test('no queda ningún script que colapse el banner al desplazarse', () => {
  assert.equal(fs.existsSync(path.join(publicDir, 'banner.js')), false, 'banner.js debe estar eliminado');

  for (const file of fs.readdirSync(publicDir)) {
    if (!/\.(html|js)$/.test(file)) continue;
    const content = read(file);
    assert.doesNotMatch(content, /banner\.js|sd-banner-collapsed/, `${file}: referencia al banner eliminado`);
  }
});

test('el CSS deja la barra en flujo normal en las páginas sin banner', () => {
  const css = read('style.css');

  assert.match(css, /\.page-no-banner \.topbar-shell \{[^}]*position: relative/s);
  assert.match(css, /\.page-no-banner main \{[^}]*padding-top:/s);
  assert.match(css, /\.page-no-banner \.card \{[^}]*margin-top: 0/s);
  assert.match(css, /\.page-no-banner \.shell-nav \{[^}]*position: static/s);
  assert.doesNotMatch(css, /\.banner-toggle/);
  assert.doesNotMatch(css, /\.hero-header\.is-collapsed/);
});
