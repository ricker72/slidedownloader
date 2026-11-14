const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSlideShareUrl, sanitizeFileName } = require('../services/slideshareService');

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
