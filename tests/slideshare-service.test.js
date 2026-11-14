const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSlideShareUrl, sanitizeFileName, selectSlideImages, cleanSlideTitle } = require('../services/slideshareService');

test('normalizeSlideShareUrl accepts valid SlideShare URLs', () => {
  const normalized = normalizeSlideShareUrl('slideshare.net/slideshow/foo/123456');
  assert.equal(normalized, 'https://slideshare.net/slideshow/foo/123456');
});

test('normalizeSlideShareUrl rejects non-SlideShare domains', () => {
  const normalized = normalizeSlideShareUrl('https://example.com/test');
  assert.equal(normalized, null);
});

test('sanitizeFileName keeps output file names safe', () => {
  const fileName = sanitizeFileName('Mi presentación #1', 'pdf');
  assert.equal(fileName, 'Mi_presentación_1.pdf');
});

test('cleanSlideTitle quita el sufijo de formato de SlideShare', () => {
  assert.equal(cleanSlideTitle('Gusano barrenador p | PPTX'), 'Gusano barrenador p');
  assert.equal(cleanSlideTitle('Mi charla | PDF'), 'Mi charla');
  assert.equal(cleanSlideTitle('Titulo con | barra normal'), 'Titulo con | barra normal');
});

test('selectSlideImages descarta miniaturas de presentaciones relacionadas', () => {
  const base = 'https://image.slidesharecdn.com/deck-123/85/Deck-';
  const urls = [
    `${base}2-320.jpg`,
    `${base}1-320.jpg`,
    'https://cdn.slidesharecdn.com/ss_thumbnails/otro-tema-thumbnail.jpg?width=640',
    'https://cdn.slidesharecdn.com/ss_thumbnails/otro-mas-thumbnail.jpg?width=640',
    `${base}3-320.jpg`,
  ];

  const result = selectSlideImages(urls);
  assert.deepEqual(result, [`${base}1-320.jpg`, `${base}2-320.jpg`, `${base}3-320.jpg`]);
});

test('selectSlideImages conserva la resolución mayor y ordena por número', () => {
  const result = selectSlideImages([
    'https://image.slidesharecdn.com/deck-123/85/Deck-10-320.jpg',
    'https://image.slidesharecdn.com/deck-123/85/Deck-2-638.jpg',
    'https://image.slidesharecdn.com/deck-123/85/Deck-2-320.jpg',
  ]);

  assert.deepEqual(result, [
    'https://image.slidesharecdn.com/deck-123/85/Deck-2-638.jpg',
    'https://image.slidesharecdn.com/deck-123/85/Deck-10-320.jpg',
  ]);
});
