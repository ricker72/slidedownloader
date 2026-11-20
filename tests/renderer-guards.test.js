const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isBlockedHost,
  normalizeSlideshareUrl
} = require('../renderer-service/guards');

test('normalizeSlideshareUrl acepta enlaces públicos de SlideShare', () => {
  assert.equal(
    normalizeSlideshareUrl('https://www.slideshare.net/slideshow/charla/123456'),
    'https://www.slideshare.net/slideshow/charla/123456'
  );
  assert.equal(
    normalizeSlideshareUrl('slideshare.net/slideshow/charla/123456'),
    'https://slideshare.net/slideshow/charla/123456'
  );
  assert.equal(
    normalizeSlideshareUrl('http://es.slideshare.net/slideshow/charla/123456'),
    'https://es.slideshare.net/slideshow/charla/123456'
  );
});

test('normalizeSlideshareUrl rechaza otros dominios, esquemas y credenciales', () => {
  const invalid = [
    'https://example.com/slideshow/charla/1',
    'https://slideshare.net.evil.com/slideshow/charla/1',
    'https://evil.com/slideshare.net/slideshow/charla/1',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://user:pass@www.slideshare.net/slideshow/charla/1',
    'https://www.slideshare.net:8443/slideshow/charla/1',
    'https://localhost/slideshow/charla/1',
    'https://127.0.0.1/slideshow/charla/1',
    '',
    null,
    123
  ];

  for (const value of invalid) {
    assert.equal(normalizeSlideshareUrl(value), null, `debería rechazar: ${value}`);
  }
});

test('isBlockedHost bloquea destinos internos', () => {
  for (const host of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'localhost', 'metadata.google.internal']) {
    assert.equal(isBlockedHost(host), true, `debería bloquear ${host}`);
  }

  for (const host of ['www.slideshare.net', 'image.slidesharecdn.com', '8.8.8.8']) {
    assert.equal(isBlockedHost(host), false, `no debería bloquear ${host}`);
  }
});
