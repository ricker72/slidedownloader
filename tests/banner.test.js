const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const read = (file) => fs.readFileSync(path.join(publicDir, file), 'utf8');

const bannerPages = ['scribd.html', 'ai.html', 'google.html'];

test('las tres páginas con banner usan el toolbar fijo y el colapso compartido', () => {
  for (const page of bannerPages) {
    const html = read(page);

    assert.match(html, /class="hero-header"/, `${page}: falta hero-header`);
    assert.match(html, /class="topbar-shell"/, `${page}: falta el contenedor del toolbar`);
    assert.match(html, /id="hero-content"/, `${page}: falta el contenido colapsable`);
    assert.match(html, /id="banner-toggle"/, `${page}: falta el botón de banner`);
    assert.match(html, /aria-controls="hero-content"/, `${page}: el botón no apunta al hero`);
    assert.match(html, /src="banner\.js\?v=\d+"/, `${page}: falta banner.js`);
  }
});

test('el CSS define el banner oscuro y el estado colapsado', () => {
  const css = read('style.css');

  assert.match(css, /\.topbar-shell \{[^}]*position: fixed/s);
  assert.match(css, /\.hero-header \{[^}]*linear-gradient/s);
  assert.match(css, /\.hero-header\.is-collapsed \.hero \{[^}]*max-height: 0/s);
  assert.match(css, /\.hero-header\.is-collapsed ~ main \.card/);
});

test('banner.js oculta el banner al desplazarse y recuerda la elección manual', () => {
  const script = read('banner.js');

  assert.match(script, /addEventListener\('scroll'/);
  assert.match(script, /scrollY > 120/);
  assert.match(script, /sessionStorage\.getItem/);
  assert.match(script, /sessionStorage\.setItem/);
  assert.match(script, /classList\.toggle\('is-collapsed', collapsed\)/);
});
