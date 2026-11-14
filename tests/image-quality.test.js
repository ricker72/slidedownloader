const test = require('node:test');
const assert = require('node:assert/strict');
const { applyImageQuality, getImageCandidates } = require('../slides_downloader/services/slideshareService');

test('applyImageQuality sube las miniaturas conocidas a 2048 px en HD', () => {
  assert.equal(
    applyImageQuality('https://image.slidesharecdn.com/demo/85/demo-1-320.jpg', 'hd'),
    'https://image.slidesharecdn.com/demo/85/demo-1-2048.jpg'
  );
  assert.equal(
    applyImageQuality('https://image.slidesharecdn.com/demo/85/demo-1-638.jpg?cb=123', 'hd'),
    'https://image.slidesharecdn.com/demo/85/demo-1-2048.jpg?cb=123'
  );
});

test('applyImageQuality no toca las imágenes que ya son grandes ni el modo SD', () => {
  const big = 'https://image.slidesharecdn.com/demo/85/demo-1-2048.jpg';
  assert.equal(applyImageQuality(big, 'hd'), big);

  const small = 'https://image.slidesharecdn.com/demo/85/demo-1-320.jpg';
  assert.equal(applyImageQuality(small, 'sd'), small);
});

test('applyImageQuality ignora URLs sin sufijo de ancho', () => {
  const url = 'https://image.slidesharecdn.com/demo/slide.jpg';
  assert.equal(applyImageQuality(url, 'hd'), url);
});

test('getImageCandidates devuelve 2048, luego 1024 y finalmente la original', () => {
  const url = 'https://image.slidesharecdn.com/demo/85/demo-1-320.jpg';
  const candidates = getImageCandidates(url, 'hd');
  assert.deepEqual(candidates, [
    'https://image.slidesharecdn.com/demo/85/demo-1-2048.jpg',
    'https://image.slidesharecdn.com/demo/85/demo-1-1024.jpg',
    'https://image.slidesharecdn.com/demo/85/demo-1-320.jpg'
  ]);
});

test('getImageCandidates devuelve solo la original en modo SD', () => {
  const url = 'https://image.slidesharecdn.com/demo/85/demo-1-320.jpg';
  assert.deepEqual(getImageCandidates(url, 'sd'), [url]);
});
