/**
 * Utilidades compartidas por las páginas que descargan un archivo generado
 * por el servidor (SlideShare y Scribd).
 *
 * Antes la API respondía con un JSON que incluía `downloadUrl`; ahora el
 * archivo viaja en la propia respuesta para que funcione igual en local y en
 * Vercel, donde `/tmp` no se comparte entre instancias.
 */
(function (global) {
  'use strict';

  function decodeHeader(value) {
    if (!value) return '';

    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  function isJsonResponse(response) {
    return /application\/json/i.test(response.headers.get('content-type') || '');
  }

  /**
   * Nombre del archivo: cabecera propia, `filename*` de Content-Disposition
   * o un valor de respaldo.
   */
  function readFileName(response, fallback = 'presentacion') {
    const encoded = response.headers.get('X-Download-File-Name');
    if (encoded) return decodeHeader(encoded);

    const disposition = response.headers.get('Content-Disposition') || '';

    const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8) return decodeHeader(utf8[1]);

    const plain = disposition.match(/filename="?([^";]+)"?/i);
    if (plain) return plain[1];

    return fallback;
  }

  /**
   * Metadatos que la interfaz muestra tras la descarga (título, formato,
   * calidad, número de diapositivas y avisos).
   */
  function readMetadata(response) {
    const header = (name) => decodeHeader(response.headers.get(name));
    const slidesHeader = header('X-Download-Slides');
    const totalPagesHeader = header('X-Download-Total-Pages');
    const slides = slidesHeader ? Number(slidesHeader) : NaN;
    const totalPages = totalPagesHeader ? Number(totalPagesHeader) : NaN;
    const failedSlides = Number(header('X-Download-Failed-Slides'));
    const warnings = header('X-Download-Warnings');

    return {
      title: header('X-Download-Title'),
      format: header('X-Download-Format'),
      quality: header('X-Download-Quality'),
      slideCount: Number.isFinite(slides) ? slides : null,
      totalPages: Number.isFinite(totalPages) ? totalPages : null,
      source: header('X-Download-Source'),
      failedSlideCount: Number.isFinite(failedSlides) ? failedSlides : 0,
      warnings: warnings ? warnings.split(' | ') : []
    };
  }

  /**
   * Mensaje de error de una respuesta JSON o un texto de respaldo.
   */
  async function readErrorMessage(response, fallback = 'No se pudo completar la descarga') {
    try {
      if (isJsonResponse(response)) {
        const data = await response.json();
        if (data && data.error) return data.error;
      }
    } catch (error) {
      // Sin cuerpo legible: usar el mensaje de respaldo.
    }

    return `${fallback} (HTTP ${response.status})`;
  }

  /**
   * Guarda la respuesta como archivo local y devuelve su nombre y tamaño.
   */
  async function saveResponseAsFile(response, fallbackName = 'presentacion') {
    const blob = await response.blob();
    const fileName = readFileName(response, fallbackName);
    const objectUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();

    // Dar tiempo al navegador a iniciar la descarga antes de liberar el blob.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);

    return { fileName, size: blob.size };
  }

  global.DownloadUtils = {
    decodeHeader,
    isJsonResponse,
    readFileName,
    readMetadata,
    readErrorMessage,
    saveResponseAsFile
  };
})(window);
