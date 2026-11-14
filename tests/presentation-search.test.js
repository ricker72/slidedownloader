const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTopic,
  normalizeFormats,
  buildSearchQuery,
  buildGoogleUrl,
  getFormatFromUrl,
  cleanFileTitle,
  toDirectResult,
  parseDuckDuckGoHtml,
  parseDuckDuckGoLite,
  parseBingHtml,
  mergeRoundRobin,
} = require('../services/presentationSearch');

test('normalizeTopic limpia espacios y comillas', () => {
  assert.equal(normalizeTopic('  "historia   de México"  '), 'historia de México');
  assert.equal(normalizeTopic(''), '');
});

test('normalizeFormats conserva solo formatos válidos y usa todos por defecto', () => {
  assert.deepEqual(normalizeFormats('pptx, pdf, docx'), ['pptx', 'pdf']);
  assert.deepEqual(normalizeFormats(['.PPT', 'pptx']), ['ppt', 'pptx']);
  assert.deepEqual(normalizeFormats('docx'), ['pptx', 'ppt', 'pdf']);
  assert.deepEqual(normalizeFormats(''), ['pptx', 'ppt', 'pdf']);
});

test('buildSearchQuery combina los formatos seleccionados con OR', () => {
  assert.equal(buildSearchQuery('marketing digital', 'pptx'), 'marketing digital filetype:pptx');
  assert.equal(
    buildSearchQuery('Gusano barrenador', ['pptx', 'ppt', 'pdf']),
    'Gusano barrenador (filetype:pptx OR filetype:ppt OR filetype:pdf)'
  );
});

test('buildGoogleUrl combina los formatos seleccionados', () => {
  const url = buildGoogleUrl('historia', ['pptx', 'pdf']);
  assert.match(url, /^https:\/\/www\.google\.com\/search\?q=/);
  assert.match(decodeURIComponent(url), /historia \(filetype:pptx OR filetype:pdf\)/);
});

test('getFormatFromUrl solo acepta extensiones de archivo compatibles', () => {
  assert.equal(getFormatFromUrl('https://x.edu/clase.PPTX?download=1'), 'pptx');
  assert.equal(getFormatFromUrl('https://x.edu/clase.ppt'), 'ppt');
  assert.equal(getFormatFromUrl('https://x.edu/clase.pdf'), 'pdf');
  assert.equal(getFormatFromUrl('https://x.edu/clase.html'), null);
});

test('cleanFileTitle reemplaza títulos genéricos por el nombre del archivo', () => {
  assert.equal(
    cleanFileTitle('PPTX Presentación de PowerPoint', 'https://x.edu/archivos/historia_de_mexico.pptx'),
    'Historia de mexico'
  );
  assert.equal(
    cleanFileTitle('PPT La Revolución Mexicana', 'https://x.edu/rev.ppt'),
    'La Revolución Mexicana'
  );
});

test('toDirectResult descarta páginas HTML, anuncios y sitios con registro', () => {
  assert.equal(
    toDirectResult({ title: 'Página', url: 'https://x.edu/articulo.html' }, 'pdf'),
    null
  );

  assert.equal(
    toDirectResult({ title: 'PDF', url: 'https://www.studocu.com/es/documento.pdf' }, 'pdf'),
    null
  );

  assert.equal(
    toDirectResult({ title: 'PPTX', url: 'https://x.edu/archivo.pdf' }, 'pptx'),
    null
  );

  const result = toDirectResult({
    title: 'PPTX Presentación de PowerPoint',
    url: 'https://x.edu/archivos/energia_solar.pptx',
    snippet: 'Energía solar .',
  }, 'pptx');

  assert.equal(result.format, 'pptx');
  assert.equal(result.domain, 'x.edu');
  assert.equal(result.title, 'Energia solar');
  assert.equal(result.snippet, 'Energía solar.');

  const malformedPath = toDirectResult({
    title: 'Archivo',
    url: 'https://x.edu/archivo%zz.pdf',
  }, 'pdf');
  assert.equal(malformedPath.fileName, 'archivo%zz.pdf');
});

test('parseDuckDuckGoHtml extrae resultados orgánicos y decodifica uddg', () => {
  const html = `
    <div class="result results_links results_links_deep result--ad">
      <a class="result__a" href="https://duckduckgo.com/y.js?ad=1">Anuncio</a>
    </div>
    <div class="result results_links results_links_deep">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fx.edu%2Farchivo.pptx#frag">PPTX Presentación</a>
      </h2>
      <a class="result__snippet" href="#">Diapositivas de <b>prueba</b>.</a>
      <a class="result__url" href="#">x.edu/archivo.pptx</a>
    </div>
  `;

  const parsed = parseDuckDuckGoHtml(html);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].url, 'https://x.edu/archivo.pptx');
  assert.equal(parsed[0].title, 'PPTX Presentación');
  assert.equal(parsed[0].snippet, 'Diapositivas de prueba.');
});

test('parseDuckDuckGoLite ignora enlaces patrocinados y extrae el snippet', () => {
  const html = `
    <a rel="nofollow" href="https://duckduckgo.com/y.js?ad=1" class='result-link'>Compra historia</a>
    (Sponsored link - <a href="https://duckduckgo.com/duckduckgo-help-pages/company/ads-by-microsoft-on-duckduckgo-private-search/" class='result-link'>more info</a>)
    <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fx.edu%2Fhistoria.pdf" class='result-link'>PDF Historia</a>
    <td class='result-snippet'>Documento de historia.</td>
  `;

  const parsed = parseDuckDuckGoLite(html);
  assert.equal(parsed.length, 1);
  const file = parsed.find((item) => item.title === 'PDF Historia');
  assert.equal(file.url, 'https://x.edu/historia.pdf');
  assert.equal(file.snippet, 'Documento de historia.');
});

test('parseBingHtml decodifica resultados de archivos directos', () => {
  const fileUrl = 'https://files.example.org/slides/gusano_barrenador.pptx';
  const redirect = `https://www.bing.com/ck/a?u=a1${Buffer.from(fileUrl).toString('base64url')}`;
  const html = `
    <ol id="b_results">
      <li class="b_algo">
        <h2><a href="${redirect}">Gusano barrenador - PPTX</a></h2>
        <p>Presentación de referencia.</p>
      </li>
    </ol>
  `;

  const parsed = parseBingHtml(html);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].url, fileUrl);
  assert.equal(parsed[0].title, 'Gusano barrenador - PPTX');
  assert.equal(parsed[0].snippet, 'Presentación de referencia.');
});

test('mergeRoundRobin intercala formatos, elimina duplicados y respeta el límite', () => {
  const groups = [
    [{ url: 'a1' }, { url: 'a2' }],
    [{ url: 'b1' }],
    [{ url: 'c1' }, { url: 'a1' }],
  ];

  const merged = mergeRoundRobin(groups, 4);
  assert.deepEqual(merged.map((item) => item.url), ['a1', 'b1', 'c1', 'a2']);
});
