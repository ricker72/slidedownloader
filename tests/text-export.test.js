const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  TEXT_FORMATS,
  MAX_CHARS_PER_SLIDE,
  buildTextExport,
  createTextExportFile
} = require('../services/textExportService');

const sanitizeFileName = (name, extension) => `${String(name).replace(/[^a-z0-9 -]/gi, '').trim() || 'presentacion'}.${extension}`;

test('la exportación TXT usa metadatos y no afirma que hay OCR', () => {
  const { text, warnings } = buildTextExport({
    title: 'Control de plagas',
    author: 'Juan Pérez',
    sourceUrl: 'https://www.slideshare.net/slideshow/abc/123',
    slideCount: 12,
    format: 'txt',
    warnings: ['No se aplicó OCR; el texto procede de metadatos públicos.']
  });

  assert.match(text, /Título: Control de plagas/);
  assert.match(text, /Autor: Juan Pérez/);
  assert.match(text, /Diapositivas detectadas: 12/);
  assert.match(text, /Método: Metadatos públicos \(sin OCR\)/);
  assert.match(text, /no es una transcripción de las diapositivas/);
  assert.ok(warnings.some((warning) => warning.includes('No se aplicó OCR')));
});

test('la exportación Markdown escapa sintaxis del texto reconocido', () => {
  const { text } = buildTextExport({
    title: 'Tema',
    format: 'md',
    source: 'ocr',
    slideTexts: [
      { slide: 2, text: '# Falso encabezado\n> Falsa cita\nTexto real' },
      { slide: 1, text: 'Primera diapositiva' }
    ]
  });

  assert.match(text, /^# Tema/m);
  assert.match(text, /## Diapositiva 2/);
  assert.match(text, /\\# Falso encabezado/);
  assert.match(text, /\\> Falsa cita/);
  assert.match(text, /## Diapositiva 1/);
  assert.ok(text.indexOf('## Diapositiva 1') < text.indexOf('## Diapositiva 2'));
});

test('el texto se limita por diapositiva y se eliminan caracteres de control', () => {
  const slideTexts = [
    { slide: 1, text: `a\u0000b\u0007\n${'x'.repeat(MAX_CHARS_PER_SLIDE + 500)}` }
  ];

  const { text } = buildTextExport({ title: 'Tema', format: 'txt', slideTexts });

  assert.ok(!text.includes('\u0000'));
  assert.ok(!text.includes('\u0007'));
  assert.ok(text.includes('x'.repeat(100)));
  assert.ok(text.length < MAX_CHARS_PER_SLIDE + 2000);
  assert.ok(text.includes('…'));
});

test('los avisos se deduplican y el límite de diapositivas se respeta', () => {
  const slideTexts = Array.from({ length: 40 }, (_, index) => ({ slide: index + 1, text: `Texto ${index}` }));
  const { text } = buildTextExport({
    title: 'Tema',
    format: 'txt',
    slideTexts,
    warnings: ['Igual', 'Igual', 'Otro', 'x'.repeat(400)]
  });

  assert.match(text, /Diapositiva 30/);
  assert.doesNotMatch(text, /Diapositiva 31/);
  assert.equal((text.match(/- Igual/g) || []).length, 1);
  assert.match(text, /- Otro/);
  assert.ok(!text.includes('x'.repeat(320)));
});

test('una fuente inválida no rompe la exportación', () => {
  const { text } = buildTextExport({ title: 'Tema', format: 'txt', sourceUrl: 'javascript:alert(1)' });
  assert.match(text, /Fuente: No disponible/);
});

test('los metadatos con saltos de línea no inyectan estructura Markdown', () => {
  const { text } = buildTextExport({
    title: '# Falso título\n# Segundo falso',
    author: 'Autor\n- lista falsa',
    format: 'md',
    source: 'ocr',
    warnings: ['Aviso\n## Encabezado falso']
  });

  assert.match(text, /^# \\# Falso título # Segundo falso\n/);
  assert.match(text, /^- \*\*Autor\*\*: Autor - lista falsa$/m);
  assert.match(text, /^- Aviso ## Encabezado falso$/m);
  assert.doesNotMatch(text, /^# Segundo falso$/m);
  assert.doesNotMatch(text, /^## Encabezado falso$/m);
});

test('createTextExportFile escribe el archivo con extensión segura', async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sd-text-'));

  try {
    const result = await createTextExportFile(
      { title: 'Mi ../tema', format: 'md', slideCount: 3 },
      dir,
      { sanitizeFileName, defaultTitle: 'presentacion' }
    );

    assert.equal(result.filename, 'Mi tema.md');
    assert.equal(result.source, 'metadata');
    assert.equal(result.slideCount, 3);
    assert.match(await fs.promises.readFile(result.outputFile, 'utf8'), /^# Mi \.\.\/tema/m);
    assert.match(await fs.promises.readFile(result.outputFile, 'utf8'), /## Diapositiva 3/);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test('formatos de texto inválidos se rechazan con estado 400', () => {
  assert.deepEqual(TEXT_FORMATS, ['txt', 'md']);
  assert.throws(
    () => buildTextExport({ title: 'Tema', format: 'pdf' }),
    (error) => error.status === 400
  );
});
