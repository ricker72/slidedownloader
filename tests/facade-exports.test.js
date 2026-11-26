const test = require('node:test');
const assert = require('node:assert/strict');

const slideshareService = require('../services/slideshareService');

const EXPECTED_TYPES = {
  DEFAULT_TITLE: 'string',
  DOWNLOADS_DIR: 'string',
  SUPPORTED_FORMATS: 'object',
  MAX_SLIDES: 'number',
  MAX_IMAGE_BYTES: 'number',
  MAX_TOTAL_IMAGE_BYTES: 'number',
  getLimits: 'function',
  normalizeSlideShareUrl: 'function',
  sanitizeFileName: 'function',
  cleanSlideTitle: 'function',
  extractPresentationInfo: 'function',
  extractPresentationInfoLite: 'function',
  extractPresentationInfoViaRenderer: 'function',
  selectSlideImages: 'function',
  sanitizeProvidedImageUrls: 'function',
  downloadPresentation: 'function',
  buildPresentationFileFromImages: 'function',
  buildJobDir: 'function',
  cleanupOldJobs: 'function',
  createPptxFromImages: 'function',
  createPdfFromImages: 'function',
  createDocxFromImages: 'function',
  convertPptxToVariant: 'function',
  detectImageMime: 'function',
  toDataUri: 'function',
  normalizeImageBuffer: 'function',
  looksLikeTextOrDiagram: 'function',
  applyImageQuality: 'function',
  getImageCandidates: 'function',
  downloadImage: 'function',
  downloadImagesConcurrently: 'function',
  getImageDimensions: 'function',
  fitImageWithinBox: 'function'
};

test('la fachada de SlideShare conserva exactamente sus 34 exports públicos', () => {
  assert.deepEqual(Object.keys(slideshareService).sort(), Object.keys(EXPECTED_TYPES).sort());

  for (const [name, type] of Object.entries(EXPECTED_TYPES)) {
    assert.equal(typeof slideshareService[name], type, name);
  }
});

test('los formatos y constantes públicas conservan sus valores', () => {
  assert.deepEqual(slideshareService.SUPPORTED_FORMATS, [
    'pdf', 'pptx', 'ppsx', 'potx', 'docx', 'txt', 'md'
  ]);
  assert.equal(slideshareService.DEFAULT_TITLE, 'presentacion');
  assert.equal(slideshareService.MAX_SLIDES, 200);
  assert.equal(slideshareService.MAX_IMAGE_BYTES, 15 * 1024 * 1024);
  assert.equal(slideshareService.MAX_TOTAL_IMAGE_BYTES, 160 * 1024 * 1024);
});
