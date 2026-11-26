const fs = require('fs');
const path = require('path');
const {
  DOWNLOADS_DIR,
  DEFAULT_TITLE,
  SUPPORTED_FORMATS,
  QUALITY_LEVELS,
  getRuntime
} = require('../../config');
const { ERROR_CODES, createServiceError } = require('../errors');
const {
  normalizeSlideShareUrl,
  cleanSlideTitle,
  sanitizeFileName,
  selectSlideImages,
  sanitizeProvidedImageUrls,
  buildJobDir
} = require('./slideUtils');
const {
  extractPresentationInfoViaRenderer,
  extractPresentationInfoLite
} = require('./extractors');
const { downloadImage } = require('./imageDownload');
const { buildPresentationFileFromImages } = require('./documents');
const { createOcrEngine } = require('../ocrService');
const { TEXT_FORMATS, createTextExportFile } = require('../textExportService');

async function downloadPresentation(url, format = 'pdf', quality = 'sd', options = {}) {
  const normalizedUrl = normalizeSlideShareUrl(url);
  if (!normalizedUrl) {
    throw createServiceError('URL inválida. Debe ser una URL válida de SlideShare.', 400, ERROR_CODES.INVALID_URL);
  }

  const extension = String(format || 'pdf').toLowerCase();
  if (!SUPPORTED_FORMATS.includes(extension)) {
    throw createServiceError(`Formato no soportado: ${format}`, 400, ERROR_CODES.UNSUPPORTED_FORMAT);
  }

  const selectedQuality = String(quality || 'sd').toLowerCase();
  if (!QUALITY_LEVELS.includes(selectedQuality)) {
    throw createServiceError(`Calidad no soportada: ${quality}`, 400, ERROR_CODES.UNSUPPORTED_QUALITY);
  }

  const { jobId, jobDir } = buildJobDir();

  // La vista previa del cliente ya trae las diapositivas detectadas; usarlas
  // evita la llamada lenta al renderizador.
  const providedImages = sanitizeProvidedImageUrls(options.imageUrls);
  const providedTitle = typeof options.title === 'string' ? cleanSlideTitle(options.title) : '';

  // El progreso público nunca incluye URLs: solo etapas y contadores.
  const upstreamProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const failedImages = [];
  const reportProgress = (update = {}) => {
    const { failedUrl, ...safe } = update;

    if (failedUrl) {
      failedImages.push(String(failedUrl));
      safe.failed = failedImages.length;
    }

    if (upstreamProgress) upstreamProgress(safe);
  };

  const cleanup = () => {
    try {
      fs.rmSync(jobDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('No se pudo limpiar el directorio del trabajo:', error.message);
    }
  };

  try {
    reportProgress({ stage: 'preparing', format: extension, quality: selectedQuality });

    let imageUrls = providedImages;
    let title = providedTitle || DEFAULT_TITLE;
    let slideTexts = [];
    const textWarnings = [];

    // En la exportación de texto, un título ya detectado evita repetir la
    // inspección de la URL cuando el cliente no aportó imágenes.
    if (!imageUrls.length && !(TEXT_FORMATS.includes(extension) && providedTitle)) {
      reportProgress({ stage: 'analyzing' });
      let info = null;

      const rendererConfigured = Boolean(getRuntime().rendererUrl);

      // Intento 1: renderizador externo (siempre intentar primero si está configurado,
      // porque es el único que hace scroll y obtiene TODAS las imágenes)
      if (rendererConfigured) {
        try {
          info = await extractPresentationInfoViaRenderer(normalizedUrl);
        } catch (rendererError) {
          console.warn('Renderizador externo falló:', rendererError.message);
          info = null;
        }
      }

      // Intento 2: fetch directo (solo como fallback si el renderizador no está configurado o falló)
      if (!info) {
        try {
          info = await extractPresentationInfoLite(normalizedUrl);
        } catch (error) {
          console.warn('Fetch directo falló:', error.message);
        }
      }

      if (!info) {
        // Los formatos binarios necesitan imágenes; la exportación de texto
        // puede continuar con los metadatos que ya tenía el cliente.
        if (!TEXT_FORMATS.includes(extension)) {
          throw createServiceError('No se pudo inspeccionar la presentación. Intenta nuevamente o configura un servidor de renderizado externo.', 503, ERROR_CODES.INSPECTION_FAILED);
        }
        textWarnings.push('No se pudo inspeccionar la presentación; se exportaron los metadatos disponibles.');
      } else {
        imageUrls = selectSlideImages(info.imageUrls);
        if (!TEXT_FORMATS.includes(extension) || !providedTitle) {
          title = cleanSlideTitle(info.title) || DEFAULT_TITLE;
        }
      }
    }

    if (!imageUrls.length && !TEXT_FORMATS.includes(extension)) {
      throw createServiceError('No se encontraron imágenes válidas para convertir la presentación.', 422, ERROR_CODES.NO_IMAGES);
    }

    if (TEXT_FORMATS.includes(extension)) {
      reportProgress({ stage: 'generating-file' });
      const warnings = [...textWarnings];
      const {
        ocrEnabled,
        ocrCacheDir,
        ocrLang,
        ocrMaxSlides,
        ocrTimeoutMs
      } = getRuntime();
      let source = 'metadata';

      if (ocrEnabled && imageUrls.length) {
        let engine = null;

        try {
          const cacheDir = ocrCacheDir || path.join(DOWNLOADS_DIR, '.ocr-cache');

          engine = createOcrEngine({
            enabled: true,
            lang: ocrLang,
            maxSlides: ocrMaxSlides,
            timeoutMs: ocrTimeoutMs,
            cacheDir,
            downloadImage,
            quality: selectedQuality
          });
          slideTexts = await engine.recognizeSlides(imageUrls);

          if (slideTexts.some((slide) => slide.text)) {
            source = 'ocr';
          }

          for (const slide of slideTexts) {
            if (slide.error) warnings.push(`Diapositiva ${slide.slide}: no se pudo reconocer el texto.`);
          }
        } catch (error) {
          // No exponer detalles internos del motor en una cabecera pública.
          warnings.push('OCR no disponible; se exportaron solo los metadatos.');
        } finally {
          if (engine) await engine.terminate().catch(() => {});
        }
      } else {
        warnings.push(
          ocrEnabled
            ? 'No se encontraron imágenes para aplicar OCR; se exportaron solo los metadatos.'
            : 'No se aplicó OCR; el texto procede de metadatos públicos.'
        );
      }

      const textFile = await createTextExportFile({
        title,
        author: options.author || '',
        sourceUrl: normalizedUrl,
        slideCount: imageUrls.length,
        slideTexts,
        warnings,
        format: extension,
        source
      }, jobDir, { sanitizeFileName, defaultTitle: DEFAULT_TITLE });

      return {
        success: true,
        jobId,
        title,
        format: extension,
        quality: selectedQuality,
        source,
        imageCount: imageUrls.length,
        fileName: textFile.filename,
        filePath: textFile.outputFile,
        warnings,
        failedSlideCount: 0,
        downloadUrl: `/download/${jobId}/${textFile.filename}`
      };
    }

    reportProgress({ stage: 'downloading-images', current: 0, total: imageUrls.length });
    const result = await buildPresentationFileFromImages(
      imageUrls,
      extension,
      jobDir,
      title,
      selectedQuality,
      reportProgress
    );

    const warnings = failedImages.length
      ? [`${failedImages.length} diapositiva${failedImages.length === 1 ? '' : 's'} no se pudieron descargar; el archivo incluye el resto.`]
      : [];

    return {
      success: true,
      jobId,
      title,
      format: extension,
      quality: selectedQuality,
      source: providedImages.length ? 'preview' : 'renderer',
      imageCount: Math.max(0, imageUrls.length - failedImages.length),
      fileName: result.filename,
      filePath: result.outputFile,
      warnings,
      failedSlideCount: failedImages.length,
      // Se conserva por compatibilidad; la API envía el archivo en la misma
      // respuesta y borra el directorio del trabajo.
      downloadUrl: `/download/${jobId}/${result.filename}`
    };
  } catch (error) {
    reportProgress({ stage: 'failed' });
    // No dejar carpetas vacías cuando la generación falla.
    cleanup();
    throw error;
  }
}

module.exports = { downloadPresentation };
