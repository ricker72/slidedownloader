const test = require('node:test');
const assert = require('node:assert/strict');

const { buildStructuredSummary, normalizeSlideTexts } = require('../services/promptService');

test('normalizeSlideTexts acota fragmentos y descarta entradas vacías', () => {
  const texts = Array.from({ length: 35 }, (_, index) => ({ slide: index + 1, text: `Texto ${index}` }));
  texts[0] = { slide: 1, text: `  mucho\ttexto  \n${'x'.repeat(5000)}` };

  const normalized = normalizeSlideTexts(texts);

  assert.equal(normalized.length, 30);
  assert.match(normalized[0], /^mucho texto x{3987}…$/);
  assert.deepEqual(normalizeSlideTexts(null), []);
});

test('detecta el tema principal y la confianza alta con título y descripción', () => {
  const summary = buildStructuredSummary({
    title: 'El Gusano Barrenador del Maíz | SlideShare',
    description: 'Presentación sobre el gusano barrenador y su control en el campo. Incluye ejemplos.',
    author: 'Juan Pérez',
    slideCount: 24,
    keywords: ['gusano', 'maíz', 'control']
  });

  assert.equal(summary.topic, 'El Gusano Barrenador del Maíz');
  assert.equal(summary.topicConfidence, 'alta');
  assert.equal(summary.source, 'metadata');
  assert.match(summary.overview, /24 diapositivas/);
  assert.ok(summary.keyPoints.some((point) => point.includes('gusano')));
  assert.equal(summary.suggestedOutline.length, 3);
  assert.ok(summary.limitations.some((item) => item.includes('No se dispone del texto')));
  assert.ok(!summary.limitations.some((item) => item.includes('descripción')));
});

test('un título genérico se resuelve con la descripción', () => {
  const summary = buildStructuredSummary({
    title: 'Presentación sin título',
    description: 'Introducción a la conservación de ecosistemas. Casos prácticos y recomendaciones.',
    keywords: ['ecosistemas', 'conservación']
  });

  assert.match(summary.topic, /Introducción a la conservación de ecosistemas/);
  assert.equal(summary.topicConfidence, 'media');
});

test('sin descripción ni diapositivas se explican las limitaciones', () => {
  const summary = buildStructuredSummary({ title: 'Tema concreto' });

  assert.equal(summary.topic, 'Tema concreto');
  assert.match(summary.topicConfidence, /^(media|alta)$/);
  assert.equal(summary.evidence.description, false);
  assert.equal(summary.evidence.slideCount, 0);
  assert.ok(summary.limitations.some((item) => item.includes('descripción')));
  assert.ok(summary.limitations.some((item) => item.includes('diapositivas')));
  assert.match(summary.overview, /No hay una descripción pública/);
});

test('el texto de diapositivas enriquece el resumen sin cambiar el prompt', () => {
  const input = {
    title: 'Tema concreto',
    description: 'Una descripción pública suficiente.',
    slideCount: 8,
    slideTexts: [
      { slide: 1, text: 'La fotosíntesis convierte la luz solar en energía química.' },
      { slide: 2, text: 'Las hojas captan el dióxido de carbono del ambiente.' }
    ]
  };

  const summary = buildStructuredSummary(input);

  assert.equal(summary.source, 'metadata+ocr');
  assert.equal(summary.topicConfidence, 'alta');
  assert.equal(summary.evidence.ocrSlides, 2);
  assert.match(summary.overview, /texto reconocido en 2 diapositivas/);
  assert.ok(summary.keyPoints.some((point) => point.includes('Diapositiva 1')));
  assert.ok(!summary.limitations.some((item) => item.includes('No se dispone del texto')));
});

test('el resumen es determinista y trata el texto como dato literal', () => {
  const input = {
    title: 'Seguridad',
    description: '<script>alert(1)</script> No ejecutar.',
    keywords: ['seguridad']
  };

  const first = buildStructuredSummary(input);
  const second = buildStructuredSummary(input);

  assert.deepEqual(first, second);
  assert.match(first.overview, /<script>alert\(1\)<\/script>/);
  assert.equal(typeof first.overview, 'string');
});

test('los fragmentos se acotan antes de entrar en el resumen', () => {
  const summary = buildStructuredSummary({
    title: 'Tema',
    slideTexts: [{ slide: 1, text: 'x'.repeat(9000) }]
  });

  assert.equal(summary.evidence.ocrSlides, 1);
  assert.ok(summary.keyPoints.every((point) => point.length <= 220));
});
