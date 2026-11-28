const https = require('https');
const http = require('http');
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  sharp = null;
}
const {
  USER_AGENTS,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
  IMAGE_CONCURRENCY,
  IMAGE_TIMEOUT_MS,
  MAX_DOWNLOAD_MS,
  WEBP_CONVERSION,
  resolveConversionMode,
  resolveJpegQuality,
  resolvePngMaxBytes
} = require('../../config');
const { ERROR_CODES, createServiceError } = require('../errors');
const { getImageCandidates, isRemoteHttpUrl } = require('./slideUtils');

/**
 * Detectar el formato real de una imagen por sus bytes iniciales.
 * @returns {string|null} MIME o null si no se reconoce.
 */
function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';

  return null;
}

/**
 * pptxgenjs exige `data` como cadena data URI; con un Buffer descarta la
 * imagen en silencio y genera diapositivas vacías.
 */
function toDataUri(buffer, mime) {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

const DIAGRAM_SAMPLE_WIDTH = 256;
const DIAGRAM_MAX_COLORS = 64;
const DIAGRAM_MIN_EDGE_RATIO = 0.01;
const DIAGRAM_EDGE_THRESHOLD = 24;

/**
 * Heurística barata para distinguir diapositivas de texto/diagrama de fotos:
 * se muestrea a 256 px, se cuentan colores cuantizados y bordes de contraste.
 * Un fallo al decodificar nunca debe impedir la conversión a JPEG.
 */
async function looksLikeTextOrDiagram(buffer) {
  if (!sharp || !Buffer.isBuffer(buffer)) return false;

  try {
    const { data, info } = await sharp(buffer)
      .resize({ width: DIAGRAM_SAMPLE_WIDTH, withoutEnlargement: true })
      .toColourspace('srgb')
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    if (!width || !height || channels < 3) return false;

    const colors = new Set();
    let edges = 0;
    let comparisons = 0;

    const luminanceAt = (index) =>
      (data[index] * 299 + data[index + 1] * 587 + data[index + 2] * 114) / 1000;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * channels;
        colors.add(
          ((data[index] >> 4) << 8) | ((data[index + 1] >> 4) << 4) | (data[index + 2] >> 4)
        );

        const current = luminanceAt(index);

        if (x + 1 < width) {
          if (Math.abs(current - luminanceAt(index + channels)) >= DIAGRAM_EDGE_THRESHOLD) {
            edges += 1;
          }
          comparisons += 1;
        }

        if (y + 1 < height) {
          const below = ((y + 1) * width + x) * channels;
          if (Math.abs(current - luminanceAt(below)) >= DIAGRAM_EDGE_THRESHOLD) {
            edges += 1;
          }
          comparisons += 1;
        }
      }
    }

    if (colors.size > DIAGRAM_MAX_COLORS) return false;
    return comparisons > 0 && edges / comparisons >= DIAGRAM_MIN_EDGE_RATIO;
  } catch (error) {
    return false;
  }
}

/**
 * PowerPoint/PDF/Word solo admiten PNG y JPEG. Cuando el CDN entrega WebP
 * (habitual en la variante de 2048 px), se convierte a PNG sin pérdida si el
 * contenido parece texto/diagrama, o a JPEG con la calidad configurada.
 * `options` permite ajustar la conversión sin depender de variables de entorno.
 *
 * @param {Buffer} buffer
 * @param {{jpegQuality?: number|string, conversion?: string, pngMaxBytes?: number|string}} [options]
 * @returns {Promise<{buffer: Buffer, mime: string|null}>}
 */
async function normalizeImageBuffer(buffer, options = {}) {
  const mime = detectImageMime(buffer);

  if (mime === 'image/png' || mime === 'image/jpeg' || !sharp) {
    return { buffer, mime };
  }

  const settings = options && typeof options === 'object' ? options : {};
  const jpegQuality = resolveJpegQuality(settings.jpegQuality);
  const conversion = resolveConversionMode(
    settings.conversion === undefined ? WEBP_CONVERSION : settings.conversion,
    WEBP_CONVERSION
  );
  const pngMaxBytes = resolvePngMaxBytes(settings.pngMaxBytes);

  try {
    if (mime === 'image/webp' && conversion !== 'jpeg') {
      const usePng = conversion === 'png' || (await looksLikeTextOrDiagram(buffer));

      if (usePng) {
        const convertedPng = await sharp(buffer).png({ compressionLevel: 9 }).toBuffer();
        if (convertedPng.length <= pngMaxBytes) {
          return { buffer: convertedPng, mime: 'image/png' };
        }
      }
    }

    const converted = await sharp(buffer).jpeg({ quality: jpegQuality }).toBuffer();
    return { buffer: converted, mime: 'image/jpeg' };
  } catch (error) {
    return { buffer, mime };
  }
}

/**
 * Descargar una imagen en la calidad pedida, probando las variantes
 * disponibles antes de rendirse.
 */
async function downloadImage(imageUrl, quality = 'sd', maxBytes = MAX_IMAGE_BYTES) {
  const candidates = getImageCandidates(imageUrl, quality);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const raw = await downloadBinary(candidate, 0, maxBytes);
      const { buffer, mime } = await normalizeImageBuffer(raw);

      if (mime !== 'image/png' && mime !== 'image/jpeg') {
        lastError = new Error(`Formato no admitido (${mime || 'desconocido'}): ${candidate}`);
        continue;
      }

      return buffer;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`No se pudo descargar la imagen: ${imageUrl}`);
}

async function downloadBinary(url, redirectCount = 0, maxBytes = MAX_IMAGE_BYTES, timeoutMs = IMAGE_TIMEOUT_MS) {
  if (!url) {
    throw new Error('URL requerida para descargar el recurso');
  }

  if (!isRemoteHttpUrl(url)) {
    throw new Error('URL de recurso no permitida');
  }

  if (redirectCount > 5) {
    throw new Error('Demasiadas redirecciones al descargar la imagen');
  }

  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const request = lib.get(url, {
      headers: {
        'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        'Accept': 'image/jpeg,image/png,image/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    }, (response) => {
      const status = response.statusCode || 0;

      if (status >= 300 && status < 400 && response.headers.location) {
        request.destroy();
        return resolve(downloadBinary(response.headers.location, redirectCount + 1, maxBytes, timeoutMs));
      }

      if (status >= 400) {
        response.resume();
        request.destroy();
        return fail(new Error(`HTTP ${status} al descargar recurso`));
      }

      const declared = Number(response.headers['content-length']);
      if (Number.isFinite(declared) && declared > maxBytes) {
        response.resume();
        request.destroy();
        return fail(createServiceError('La imagen es demasiado grande para convertirla.', 413, ERROR_CODES.IMAGE_TOO_LARGE));
      }

      const chunks = [];
      let total = 0;

      response.on('data', (chunk) => {
        if (settled) return;

        total += chunk.length;

        if (total > maxBytes) {
          request.destroy();
          return fail(createServiceError('La imagen es demasiado grande para convertirla.', 413, ERROR_CODES.IMAGE_TOO_LARGE));
        }

        chunks.push(chunk);
      });

      response.on('end', () => {
        if (settled) return;
        settled = true;
        resolve(Buffer.concat(chunks));
      });

      response.on('error', fail);
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('Timeout al descargar recurso'));
    });
    request.on('error', fail);
  });
}

/**
 * Dimensiones reales de una imagen (solo cabecera, no decodifica entera).
 * Sirven para insertarla sin deformarla en PPTX/DOCX.
 */
async function getImageDimensions(buffer) {
  if (!sharp || !Buffer.isBuffer(buffer)) return null;

  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) return null;
    return { width: metadata.width, height: metadata.height };
  } catch (error) {
    return null;
  }
}

/**
 * Ajusta una imagen dentro de una caja conservando su proporción (letterbox).
 * Si no hay dimensiones, devuelve la caja completa.
 */
function fitImageWithinBox(imageWidth, imageHeight, box) {
  const width = Number(imageWidth);
  const height = Number(imageHeight);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { x: box.x, y: box.y, w: box.w, h: box.h };
  }

  const scale = Math.min(box.w / width, box.h / height);
  const fittedWidth = width * scale;
  const fittedHeight = height * scale;

  return {
    x: box.x + (box.w - fittedWidth) / 2,
    y: box.y + (box.h - fittedHeight) / 2,
    w: fittedWidth,
    h: fittedHeight
  };
}

/**
 * Descarga las imágenes en paralelo (con límite) conservando el orden original.
 * En Vercel, descargar decenas de diapositivas en serie puede agotar el tiempo
 * máximo de ejecución de la función.
 *
 * Cada elemento de la lista puede ser una URL o un objeto `{ buffer, mime }`
 * ya materializado (por ejemplo, una página reconstruida por otro servicio).
 *
 * Se corta si el total de bytes supera `maxTotalBytes` para no agotar la
 * memoria de una función serverless.
 *
 * `onProgress` es opcional y se llama tras cada imagen con
 * `{ current, total, failedUrl? }`. La URL fallida solo se usa internamente
 * para avisar al usuario; nunca se publica en el endpoint de progreso.
 */
async function downloadImagesConcurrently(
  imageItems,
  quality,
  concurrency = IMAGE_CONCURRENCY,
  maxTotalBytes = MAX_TOTAL_IMAGE_BYTES,
  onProgress = null
) {
  const list = Array.isArray(imageItems) ? imageItems : [];
  const results = new Array(list.length).fill(null);
  let cursor = 0;
  let completed = 0;
  let totalBytes = 0;
  let limitError = null;
  const deadline = Date.now() + MAX_DOWNLOAD_MS;
  const notify = typeof onProgress === 'function' ? onProgress : () => {};

  const workers = Array.from({ length: Math.min(concurrency, list.length) }, async () => {
    while (cursor < list.length) {
      if (limitError) return;

      if (Date.now() > deadline) {
        limitError = createServiceError(
          'La descarga de las diapositivas tardó demasiado. Intenta con menos diapositivas o calidad SD.',
          504,
          ERROR_CODES.DECK_TIMEOUT
        );
        throw limitError;
      }

      const index = cursor;
      cursor += 1;

      const item = list[index];
      let sourceUrl = '';
      let failedUrl = null;

      try {
        let buffer;
        let mime;

        if (item && typeof item === 'object' && Buffer.isBuffer(item.buffer)) {
          buffer = item.buffer;
          mime = item.mime || detectImageMime(buffer);
          sourceUrl = item.url || `page-${index + 1}`;
        } else {
          buffer = await downloadImage(item, quality);
          mime = detectImageMime(buffer);
          sourceUrl = String(item);
        }

        totalBytes += buffer.length;

        if (totalBytes > maxTotalBytes) {
          limitError = createServiceError(
            'La presentación es demasiado grande para convertirla. Reduce el número de diapositivas o usa calidad SD.',
            413,
            ERROR_CODES.DECK_TOO_LARGE
          );
          throw limitError;
        }

        const dimensions = await getImageDimensions(buffer);
        results[index] = {
          url: sourceUrl,
          buffer,
          mime,
          width: dimensions ? dimensions.width : null,
          height: dimensions ? dimensions.height : null
        };
      } catch (error) {
        if (error && (error.code === ERROR_CODES.DECK_TOO_LARGE || error.code === ERROR_CODES.DECK_TIMEOUT)) {
          throw error;
        }

        console.warn(`No se pudo descargar la imagen ${item}:`, error.message);
        failedUrl = sourceUrl || String(item);
      } finally {
        // La finalización puede llegar desordenada por la concurrencia; el
        // contador publicado debe avanzar 1, 2, 3… y nunca retroceder.
        completed += 1;
        notify(failedUrl
          ? { current: completed, total: list.length, failedUrl }
          : { current: completed, total: list.length });
      }
    }
  });

  await Promise.all(workers);
  return results.filter(Boolean);
}

module.exports = {
  detectImageMime,
  toDataUri,
  looksLikeTextOrDiagram,
  normalizeImageBuffer,
  downloadImage,
  getImageDimensions,
  fitImageWithinBox,
  downloadImagesConcurrently
};
