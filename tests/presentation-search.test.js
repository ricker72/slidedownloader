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
  parseGoogleSearchItems,
  mergeRoundRobin,
  getGoogleCseId,
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
    'Gusano barrenador filetype:pptx OR filetype:ppt OR filetype:pdf'
  );
});

test('buildGoogleUrl combina los formatos seleccionados', () => {
  const url = buildGoogleUrl('historia', ['pptx', 'pdf']);
  assert.match(url, /^https:\/\/www\.google\.com\/search\?q=/);
  assert.match(decodeURIComponent(url), /historia filetype:pptx OR filetype:pdf/);
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

test('toDirectResult descarta páginas que no son archivos compatibles', () => {
  assert.equal(
    toDirectResult({ title: 'Página', url: 'https://x.edu/articulo.html' }, 'pdf'),
    null
  );

  const pdf = toDirectResult({ title: 'PDF', url: 'https://www.studocu.com/es/documento.pdf' });
  assert.equal(pdf.format, 'pdf');

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

test('parseGoogleSearchItems conserva archivos compatibles seleccionados y elimina duplicados', () => {
  const items = [
    { title: 'Presentación uno', url: 'https://files.example.org/uno.pptx', contentNoFormatting: 'Slides uno.' },
    { title: 'Documento', url: 'https://files.example.org/tema.docx', contentNoFormatting: 'Word.' },
    { title: 'Presentación duplicada', url: 'https://files.example.org/uno.pptx', contentNoFormatting: 'Duplicado.' },
    { title: 'Informe PDF', url: 'https://files.example.org/informe.pdf?download=1', content: 'PDF.' },
    { title: 'Presentación PPT', url: 'https://files.example.org/clase.ppt', content: 'PPT.' },
  ];

  const results = parseGoogleSearchItems(items, ['pptx', 'pdf']);
  assert.deepEqual(results.map((item) => item.url), [
    'https://files.example.org/uno.pptx',
    'https://files.example.org/informe.pdf?download=1',
  ]);
});

test('parseGoogleSearchItems usa los campos del callback de Programmable Search Element', () => {
  const [result] = parseGoogleSearchItems([{
    titleNoFormatting: 'Guía de ciencias',
    url: 'https://files.example.org/ciencias.pdf',
    contentNoFormatting: 'Material de apoyo.',
  }], ['pdf']);

  assert.equal(result.title, 'Guía de ciencias');
  assert.equal(result.format, 'pdf');
  assert.equal(result.snippet, 'Material de apoyo.');
});

test('getGoogleCseId devuelve el identificador público configurado', () => {
  const originalCseId = process.env.GOOGLE_CSE_ID;
  process.env.GOOGLE_CSE_ID = '  test-engine-id  ';

  try {
    assert.equal(getGoogleCseId(), 'test-engine-id');
  } finally {
    if (originalCseId === undefined) delete process.env.GOOGLE_CSE_ID;
    else process.env.GOOGLE_CSE_ID = originalCseId;
  }
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
