const test = require('node:test');
const assert = require('node:assert/strict');
const { applyImageQuality, getImageCandidates } = require('../services/slideshareService');

test('applyImageQuality sube las miniaturas a la carpeta /75/ con 2048 px en HD', () => {
  assert.equal(
    applyImageQuality('https://image.slidesharecdn.com/demo/85/demo-1-320.jpg', 'hd'),
    'https://image.slidesharecdn.com/demo/75/demo-1-2048.jpg'
  );
  assert.equal(
    applyImageQuality('https://image.slidesharecdn.com/demo/85/demo-1-638.jpg', 'hd'),
    'https://image.slidesharecdn.com/demo/75/demo-1-2048.jpg'
  );
});

test('applyImageQuality usa 638 px en modo SD', () => {
  assert.equal(
    applyImageQuality('https://image.slidesharecdn.com/demo/85/demo-1-320.jpg', 'sd'),
    'https://image.slidesharecdn.com/demo/85/demo-1-638.jpg'
  );
});

test('applyImageQuality no toca las imágenes que ya son grandes ni URLs ajenas', () => {
  const big = 'https://image.slidesharecdn.com/demo/75/demo-1-2048.jpg';
  assert.equal(applyImageQuality(big, 'hd'), big);

  const faltaPatron = 'https://image.slidesharecdn.com/demo/slide.jpg';
  assert.equal(applyImageQuality(faltaPatron, 'hd'), faltaPatron);

  const ajena = 'https://cdn.slidesharecdn.com/ss_thumbnails/otro-thumbnail.jpg';
  assert.equal(applyImageQuality(ajena, 'hd'), ajena);
});

test('getImageCandidates prueba 2048, 1024, 638 y la original en HD', () => {
  const url = 'https://image.slidesharecdn.com/demo/85/demo-1-320.jpg';
  assert.deepEqual(getImageCandidates(url, 'hd'), [
    'https://image.slidesharecdn.com/demo/75/demo-1-2048.jpg',
    'https://image.slidesharecdn.com/demo/95/demo-1-1024.jpg',
    'https://image.slidesharecdn.com/demo/85/demo-1-638.jpg',
    'https://image.slidesharecdn.com/demo/85/demo-1-320.jpg'
  ]);
});

test('getImageCandidates usa 638 y la original en SD', () => {
  const url = 'https://image.slidesharecdn.com/demo/85/demo-1-320.jpg';
  assert.deepEqual(getImageCandidates(url, 'sd'), [
    'https://image.slidesharecdn.com/demo/85/demo-1-638.jpg',
    'https://image.slidesharecdn.com/demo/85/demo-1-320.jpg'
  ]);
});
