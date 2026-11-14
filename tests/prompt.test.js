const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPresentationPrompt, buildAnalysis, extractKeywords, cleanTitle } = require('../slides_downloader/services/promptService');

test('buildAnalysis extrae título, palabras clave y diapositivas', (t) => {
  const result = buildAnalysis({
    title: 'El Gusano Barrenador | SlideShare',
    description: 'Presentación sobre el gusano barrenador del maíz y su control.',
    author: 'Juan Pérez',
    url: 'https://www.slideshare.net/slideshow/abc/123',
    slideCount: 24
  });

  assert.equal(result.title, 'El Gusano Barrenador');
  assert.equal(result.author, 'Juan Pérez');
  assert.equal(result.slideCount, 24);
  assert.equal(result.sourceUrl, 'https://www.slideshare.net/slideshow/abc/123');
  assert.ok(result.keywords.includes('gusano') || result.keywords.includes('barrenador') || result.keywords.includes('maíz') || result.keywords.includes('maiz'));
});

test('cleanTitle elimina sufijos de slideshare', () => {
  assert.equal(cleanTitle('Mi Tema | SlideShare'), 'Mi Tema');
  assert.equal(cleanTitle('Solo un título'), 'Solo un título');
  assert.equal(cleanTitle(''), 'Presentación sin título');
});

test('extractKeywords filtra palabras vacías y prioriza el título', () => {
  const keywords = extractKeywords({
    title: 'Control del Gusano Barrenador del Maíz',
    description: 'El gusano barrenador es una plaga del maíz que afecta tallos y hojas.'
  });
  assert.ok(keywords.includes('gusano') || keywords.includes('barrenador'));
  assert.ok(keywords.includes('maíz') || keywords.includes('maiz'));
  assert.ok(!keywords.includes('del'));
  assert.ok(!keywords.includes('es'));
  assert.ok(!keywords.includes('una'));
});

test('buildPresentationPrompt genera un prompt no vacío con sección de identidad visual', (t) => {
  const prompt = buildPresentationPrompt({
    analysis: {
      title: 'Mi Presentación',
      description: 'Sobre tecnología moderna',
      author: 'Autor Ejemplo',
      url: 'https://www.slideshare.net/slideshow/x/1',
      slideCount: 10,
      keywords: ['tecnología', 'moderna', 'software']
    },
    options: {
      goal: 'educativa',
      tone: 'profesional',
      style: 'minimalista',
      palette: 'claro',
      language: 'es',
      slides: 12,
      audience: 'estudiantes',
      brand: '',
      notes: '',
      includeImages: true,
      speakerNotes: true
    }
  });

  assert.ok(prompt.length > 200, 'el prompt debe ser sustancial');
  assert.ok(prompt.includes('Identidad visual'), 'debe incluir la sección de identidad visual');
  assert.ok(prompt.includes('minimalista'), 'debe reflejar el estilo elegido');
  assert.ok(prompt.includes('claro'), 'debe reflejar la paleta elegida');
  assert.ok(prompt.includes('12 diapositivas'), 'debe incluir el número de diapositivas');
  assert.ok(prompt.includes('No copies'), 'debe incluir la regla de originalidad');
});

test('buildPresentationPrompt funciona con solo título (sin análisis)', () => {
  const prompt = buildPresentationPrompt({
    analysis: { title: 'Tema genérico' },
    options: {}
  });
  assert.ok(prompt.length > 200);
  assert.ok(prompt.includes('Tema genérico'));
});
