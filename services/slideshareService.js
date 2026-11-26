/**
 * Fachada pública del servicio de SlideShare.
 *
 * La implementación está repartida en `services/slideshare/`:
 * - `slideUtils`: URLs, calidad, nombres y directorios de trabajo.
 * - `imageDownload`: descarga, normalización WebP y límites de imagen.
 * - `extractors`: scraping con Playwright, fetch lite y renderizador externo.
 * - `documents`: generación de PDF, PPTX, DOCX y variantes OOXML.
 * - `downloadPresentation`: orquestador del contrato de descarga.
 *
 * Este archivo conserva los nombres exportados de siempre para no tocar a los
 * 15 consumidores (producción y tests).
 */

const {
  DOWNLOADS_DIR,
  DEFAULT_TITLE,
  SUPPORTED_FORMATS,
  MAX_SLIDES,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
  getLimits
} = require('../config');

const {
  normalizeSlideShareUrl,
  sanitizeFileName,
  cleanSlideTitle,
  selectSlideImages,
  sanitizeProvidedImageUrls,
  applyImageQuality,
  getImageCandidates,
  buildJobDir,
  cleanupOldJobs
} = require('./slideshare/slideUtils');

const {
  extractPresentationInfo,
  extractPresentationInfoLite,
  extractPresentationInfoViaRenderer
} = require('./slideshare/extractors');

const {
  detectImageMime,
  toDataUri,
  normalizeImageBuffer,
  looksLikeTextOrDiagram,
  downloadImage,
  downloadImagesConcurrently,
  getImageDimensions,
  fitImageWithinBox
} = require('./slideshare/imageDownload');

const {
  buildPresentationFileFromImages,
  createPptxFromImages,
  createPdfFromImages,
  createDocxFromImages,
  convertPptxToVariant
} = require('./slideshare/documents');

const { downloadPresentation } = require('./slideshare/downloadPresentation');

module.exports = {
  DEFAULT_TITLE,
  DOWNLOADS_DIR,
  SUPPORTED_FORMATS,
  MAX_SLIDES,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
  getLimits,
  normalizeSlideShareUrl,
  sanitizeFileName,
  cleanSlideTitle,
  extractPresentationInfo,
  extractPresentationInfoLite,
  extractPresentationInfoViaRenderer,
  selectSlideImages,
  sanitizeProvidedImageUrls,
  downloadPresentation,
  buildPresentationFileFromImages,
  buildJobDir,
  cleanupOldJobs,
  createPptxFromImages,
  createPdfFromImages,
  createDocxFromImages,
  convertPptxToVariant,
  detectImageMime,
  toDataUri,
  normalizeImageBuffer,
  looksLikeTextOrDiagram,
  applyImageQuality,
  getImageCandidates,
  downloadImage,
  downloadImagesConcurrently,
  getImageDimensions,
  fitImageWithinBox
};
