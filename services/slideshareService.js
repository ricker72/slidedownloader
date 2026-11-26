const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
let chromium;
try {
  chromium = require('playwright').chromium;
} catch (error) {
  chromium = null;
}

// SlideShare publica la variante de 2048 px como WebP. PowerPoint, PDF y Word
// no la admiten de forma fiable, así que se convierte a JPEG cuando está disponible.
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  sharp = null;
}
const PDFDocument = require('pdfkit');
const PptxGenJS = require('pptxgenjs');
const { Document, Packer, Paragraph, HeadingLevel, TextRun, ImageRun } = require('docx');
const { v4: uuidv4 } = require('uuid');
const { createOcrEngine } = require('./ocrService');
const { TEXT_FORMATS, createTextExportFile } = require('./textExportService');
const { ERROR_CODES, createServiceError } = require('./errors');

const {
  DOWNLOADS_DIR,
  DEFAULT_TITLE,
  USER_AGENTS,
  SUPPORTED_FORMATS,
  QUALITY_LEVELS,
  MAX_SLIDES,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
  IMAGE_CONCURRENCY,
  IMAGE_TIMEOUT_MS,
  MAX_DOWNLOAD_MS,
  WEBP_CONVERSION,
  getLimits,
  resolveConversionMode,
  resolveJpegQuality,
  resolvePngMaxBytes
} = require('../config');

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

function cleanupOldJobs() {
  try {
    const entries = fs.readdirSync(DOWNLOADS_DIR, { withFileTypes: true });
    const cutoff = Date.now() - 1000 * 60 * 60 * 24;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(DOWNLOADS_DIR, entry.name);
      const stat = fs.statSync(fullPath);
      if (stat.mtimeMs < cutoff) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
    }
  } catch (error) {
    console.warn('No se pudieron limpiar trabajos antiguos:', error.message);
  }
}

cleanupOldJobs();

function dedupeUrls(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function normalizeSlideShareUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  let value = rawUrl.trim();
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const isAllowed = hostname === 'slideshare.net' || hostname.endsWith('.slideshare.net');
    if (!isAllowed) {
      return null;
    }

    parsed.search = '';
    return parsed.toString();
  } catch (error) {
    return null;
  }
}

/**
 * SlideShare añade el formato al título de la página ("Mi charla | PPTX").
 * Se quita ese sufijo para nombres de archivo y vistas previas más limpios.
 */
function cleanSlideTitle(title) {
  const value = String(title || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';

  return value
    .replace(/\s*\|\s*(PPTX?|PPTM|PPSX?|POTX?|PDF|DOCX?|KEY|ODP|ZIP)\s*$/i, '')
    .trim();
}

function sanitizeFileName(name, extension) {
  const safe = String(name || DEFAULT_TITLE)
    .replace(/[^a-zA-Z0-9\u00C0-\u017F\s-_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim();

  return `${safe || DEFAULT_TITLE}.${extension}`;
}

function buildJobDir() {
  const jobId = uuidv4();
  const jobDir = path.join(DOWNLOADS_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  return { jobId, jobDir };
}

function isLikelyImageUrl(value) {
  if (!value || typeof value !== 'string') return false;
  return /\.(jpg|jpeg|png|webp|gif|bmp)(\?.*)?$/i.test(value) || value.includes('slidesharecdn');
}

/**
 * Las páginas de SlideShare incluyen, además de las diapositivas, miniaturas
 * de presentaciones relacionadas, avatares y logos. Si se descargan tal cual,
 * el archivo final mezcla diapositivas reales con imágenes ajenas.
 *
 * Este selector agrupa las URLs por carpeta del CDN (`.../<deck>/<version>/`)
 * y se queda con la carpeta que contiene más diapositivas: la presentación
 * actual. Después elimina duplicados por número de diapositiva y las ordena.
 *
 * @param {number} [limit] - tope devuelto; Infinity permite contar las detectadas.
 */
function selectSlideImages(list, limit = MAX_SLIDES) {
  const urls = dedupeUrls(list).filter(isLikelyImageUrl);
  const groups = new Map();

  for (const url of urls) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      continue;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;

    // Patrón del CDN: /<deck>/<version>/<nombre>-<n>-<ancho>.<ext>
    const match = parsed.pathname.match(/\/([^/]+)\/([^/]+)\/[^/]+-(\d+)-(\d+)\.(?:jpe?g|png|webp)$/i);
    if (!match) continue;

    const folder = `${match[1]}/${match[2]}`;
    const slideNumber = Number(match[3]);
    const width = Number(match[4]);

    if (!Number.isFinite(slideNumber) || slideNumber <= 0) continue;

    if (!groups.has(folder)) groups.set(folder, new Map());
    const byNumber = groups.get(folder);
    const current = byNumber.get(slideNumber);

    // Si hay varias resoluciones de la misma diapositiva, conservar la mayor.
    if (!current || width > current.width) {
      byNumber.set(slideNumber, { url, width });
    }
  }

  if (groups.size) {
    let best = null;
    for (const [folder, byNumber] of groups) {
      if (!best || byNumber.size > best.byNumber.size) {
        best = { folder, byNumber };
      }
    }

    const ordered = [...best.byNumber.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, value]) => value.url);

    if (ordered.length) {
      return ordered.slice(0, limit);
    }
  }

  // Sin patrón reconocible: descartar imágenes que claramente no son diapositivas.
  const filtered = urls.filter(
    (url) => !/avatar|profile|user[-_]?photo|logo|icon|sprite|placeholder|default[-_]/i.test(url)
  );

  return (filtered.length ? filtered : urls).slice(0, limit);
}

/**
 * Aceptar solo URLs de diapositivas del CDN de SlideShare enviadas por el
 * cliente (la vista previa ya detectada). Así un cliente no puede forzar al
 * servidor a descargar recursos arbitrarios.
 */
function sanitizeProvidedImageUrls(imageUrls) {
  if (!Array.isArray(imageUrls)) return [];

  const seen = new Set();
  const result = [];

  for (const value of imageUrls) {
    if (typeof value !== 'string' || !isRemoteHttpUrl(value)) continue;

    const parsed = parseSlideImageUrl(value);
    if (!parsed) continue;

    const key = `${parsed.deck}/${parsed.baseName}-${parsed.slideNumber}`.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(value);

    if (result.length >= MAX_SLIDES) break;
  }

  return result;
}

/**
 * Solo se descargan recursos http(s): un src malicioso no debe sacar al
 * servidor hacia `file:`, `data:` ni otros esquemas.
 */
function isRemoteHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

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

// PPSX y POTX son el mismo paquete OOXML que PPTX con otro tipo de contenido.
const PPTX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml';
const PPTX_VARIANTS = {
  ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml',
  potx: 'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml'
};

// SlideShare publica cada diapositiva en varias "carpetas de calidad":
//   /75/ → 2048 px (máxima), /95/ → 1024 px, /85/ → 638/320 px.
// Cambiar solo el ancho de la URL no basta: hay que cambiar también la carpeta.
const SLIDE_QUALITY_TIERS = {
  hd: [
    { version: '75', width: 2048 },
    { version: '95', width: 1024 },
    { version: '85', width: 638 }
  ],
  sd: [{ version: '85', width: 638 }]
};

function parseSlideImageUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return null;

  let parsed;
  try {
    parsed = new URL(imageUrl);
  } catch (error) {
    return null;
  }

  if (!/(^|\.)slidesharecdn\.com$/i.test(parsed.hostname)) return null;

  // /<deck>/<carpeta>/<nombre>-<n>-<ancho>.<ext>
  const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/(.+)-(\d+)-(\d+)\.(jpe?g|png|webp)$/i);
  if (!match) return null;

  return {
    origin: parsed.origin,
    deck: match[1],
    version: match[2],
    baseName: match[3],
    slideNumber: Number(match[4]),
    width: Number(match[5]),
    extension: match[6]
  };
}

function buildSlideVariantUrl(parsed, version, width) {
  return `${parsed.origin}/${parsed.deck}/${version}/${parsed.baseName}-${parsed.slideNumber}-${width}.${parsed.extension}`;
}

/**
 * Reescribir la URL del CDN de SlideShare a la mejor calidad disponible.
 * Devuelve la URL original si no sigue el patrón o si ya es igual o mayor.
 */
function applyImageQuality(imageUrl, quality) {
  if (!imageUrl) return imageUrl;

  const parsed = parseSlideImageUrl(imageUrl);
  if (!parsed) return imageUrl;

  const tiers = SLIDE_QUALITY_TIERS[String(quality).toLowerCase() === 'hd' ? 'hd' : 'sd'];
  const best = tiers.find((tier) => tier.width > parsed.width);

  return best ? buildSlideVariantUrl(parsed, best.version, best.width) : imageUrl;
}

/**
 * Variantes a probar en orden. Si el CDN no publica la resolución máxima,
 * se intenta 1024 px, luego 638 px y por último la original para no perder
 * ninguna diapositiva.
 */
function getImageCandidates(imageUrl, quality = 'sd') {
  const parsed = parseSlideImageUrl(imageUrl);
  if (!parsed) return [imageUrl];

  const tiers = SLIDE_QUALITY_TIERS[String(quality).toLowerCase() === 'hd' ? 'hd' : 'sd'];
  const candidates = tiers
    .filter((tier) => tier.width > parsed.width)
    .map((tier) => buildSlideVariantUrl(parsed, tier.version, tier.width));

  candidates.push(imageUrl);
  return [...new Set(candidates)];
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

async function extractPresentationInfo(url) {
  if (!chromium) {
    throw new Error(
      'Playwright/Chromium no está disponible en este entorno serverless. Usa extractPresentationInfoLite (fetch directo) o configura RENDERER_URL para usar un servidor de renderizado externo.'
    );
  }
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
      locale: 'es-ES',
      extraHTTPHeaders: {
        'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);

    const challengeDetected = await page.evaluate(() => {
      const text = (document.body && document.body.innerText) || '';
      const lowerText = text.toLowerCase();
      return /verify you are human|check your browser|captcha|bot detected|access denied|security check|challenge/i.test(lowerText)
        || !!document.querySelector('iframe[src*="captcha"], #challenge-stage, .recaptcha')
        || !!document.querySelector('body[aria-label*="verify"], body[aria-label*="captcha"]');
    });

    const info = await page.evaluate(() => {
      const addValue = (set, raw) => {
        if (typeof raw !== 'string') return;
        const value = raw.trim();
        if (!value) return;
        if (value.startsWith('data:image')) return;
        if (/(jpg|jpeg|png|gif|webp|bmp)/i.test(value)) set.add(value);
      };

      const imageSet = new Set();
      for (const img of document.querySelectorAll('img, source')) {
        addValue(imageSet, img.currentSrc || img.src || img.dataset.src || img.dataset.original || img.getAttribute('data-full'));
        addValue(imageSet, img.getAttribute('srcset')?.split(',')[0]?.trim().split(/\s+/)[0]);
      }

      for (const meta of document.querySelectorAll('meta')) {
        addValue(imageSet, meta.getAttribute('content'));
      }

      const scriptText = Array.from(document.querySelectorAll('script'))
        .map((node) => node.textContent || '')
        .join(' ');

      const matches = scriptText.match(/https?:\/\/[^\s"'<>]+(?:\.(?:jpg|jpeg|png|webp|gif|bmp))(?:\?[^\s"'<>]*)?/gi) || [];
      for (const match of matches) {
        addValue(imageSet, match);
      }

      const title = document.title || document.querySelector('meta[property="og:title"]')?.content || document.querySelector('meta[name="twitter:title"]')?.content || 'Presentación';
      const readMeta = (selector) => document.querySelector(selector)?.getAttribute('content')?.trim() || '';

      return {
        title,
        description: readMeta('meta[name="description"]') || readMeta('meta[property="og:description"]') || readMeta('meta[name="twitter:description"]'),
        author: readMeta('meta[name="author"]') || readMeta('meta[property="article:author"]') || readMeta('meta[property="og:site_name"]'),
        imageUrls: [...imageSet].slice(0, MAX_SLIDES)
      };
    });

    return {
      title: (info.title || DEFAULT_TITLE).slice(0, 300),
      description: (info.description || '').replace(/\s+/g, ' ').slice(0, 1200),
      author: (info.author || '').replace(/\s+/g, ' ').slice(0, 160),
      imageUrls: dedupeUrls(info.imageUrls).filter(isLikelyImageUrl),
      challengeDetected,
      sourceUrl: url
    };
  } finally {
    await browser.close();
  }
}

/**
 * Alternativa ligera a Playwright para entornos serverless (Vercel).
 * Obtiene el HTML de la presentación con fetch() y extrae metadatos e
 * imágenes directamente del marcado, sin ejecutar JavaScript.
 *
 * SlideShare incrusta en el HTML inicial:
 * - Título, descripción y autor en <meta> tags (og:title, og:description, etc.)
 * - URLs de imágenes del CDN en <img src>, <img data-src>, srcset y <script>
 *
 * Esta función no necesita Chromium y funciona en serverless.
 */
async function extractPresentationInfoLite(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} al obtener la presentación`);
    }

    const html = await response.text();
    clearTimeout(timeout);

    // Extraer metadatos de <meta> tags
    const readMeta = (nameOrProperty) => {
      const patterns = [
        new RegExp(`<meta[^>]+(?:name|property)="${nameOrProperty}"[^>]+content="([^"]*)"`, 'i'),
        new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:name|property)="${nameOrProperty}"`, 'i')
      ];
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) return match[1].trim();
      }
      return '';
    };

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title =
      titleMatch?.[1]?.trim() ||
      readMeta('og:title') ||
      readMeta('twitter:title') ||
      DEFAULT_TITLE;

    const description =
      readMeta('description') ||
      readMeta('og:description') ||
      readMeta('twitter:description');

    const author =
      readMeta('author') ||
      readMeta('article:author') ||
      readMeta('og:site_name');

    // Extraer URLs de imágenes del HTML
    const imageSet = new Set();

    const addValue = (raw) => {
      if (typeof raw !== 'string') return;
      const value = raw.trim();
      if (!value) return;
      if (value.startsWith('data:image')) return;
      if (/(jpg|jpeg|png|gif|webp|bmp)/i.test(value)) imageSet.add(value);
    };

    // <img src="...">, <img data-src="...">, <img data-original="...">
    const imgMatches = html.matchAll(
      /<img[^>]+(?:src|data-src|data-original)="([^"]+)"/gi
    );
    for (const match of imgMatches) addValue(match[1]);

    // srcset="url1 320w, url2 1024w"
    const srcsetMatches = html.matchAll(/srcset="([^"]+)"/gi);
    for (const match of srcsetMatches) {
      for (const part of match[1].split(',')) {
        const urlPart = part.trim().split(/\s+/)[0];
        addValue(urlPart);
      }
    }

    // URLs de imágenes en <script> y en el HTML general
    const urlPattern =
      /https?:\/\/[^\s"'<>]+(?:\.(?:jpg|jpeg|png|webp|gif|bmp))(?:\?[^\s"'<>]*)?/gi;
    const urlMatches = html.matchAll(urlPattern);
    for (const match of urlMatches) addValue(match[0]);

    // Filtrar URLs probables de imágenes de slides
    const imageUrls = dedupeUrls([...imageSet]).filter(isLikelyImageUrl).slice(0, MAX_SLIDES);

    return {
      title: title.slice(0, 300),
      description: (description || '').replace(/\s+/g, ' ').slice(0, 1200),
      author: (author || '').replace(/\s+/g, ' ').slice(0, 160),
      imageUrls,
      challengeDetected: false,
      sourceUrl: url,
      method: 'lite'
    };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

/**
 * Extraer información de una presentación usando un servidor externo de
 * renderizado (Puppeteer/Chromium). Se usa cuando el fetch directo es
 * bloqueado por SlideShare (Client Challenge).
 *
 * Requiere la variable de entorno RENDERER_URL apuntando al renderer-service
 * desplegado en Railway, Render, fly.io, etc.
 */
async function extractPresentationInfoViaRenderer(url) {
  const rendererUrl = process.env.RENDERER_URL;

  if (!rendererUrl) {
    throw new Error('RENDERER_URL no configurada. No se puede usar el renderizador externo.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const headers = { 'Content-Type': 'application/json' };
    const rendererSecret = String(process.env.RENDERER_SECRET || '').trim();

    if (rendererSecret) {
      headers.Authorization = `Bearer ${rendererSecret}`;
    }

    const response = await fetch(`${rendererUrl.replace(/\/$/, '')}/render`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Renderizador externo respondió HTTP ${response.status}: ${errorBody}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Error del renderizador externo');
    }

    return {
      title: data.title || DEFAULT_TITLE,
      description: data.description || '',
      author: data.author || '',
      imageUrls: data.imageUrls || data.galleryImages || data.previewImages || [],
      challengeDetected: data.challengeDetected || false,
      sourceUrl: url,
      method: 'renderer'
    };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
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
 */
async function downloadImagesConcurrently(
  imageItems,
  quality,
  concurrency = IMAGE_CONCURRENCY,
  maxTotalBytes = MAX_TOTAL_IMAGE_BYTES
) {
  const list = Array.isArray(imageItems) ? imageItems : [];
  const results = new Array(list.length).fill(null);
  let cursor = 0;
  let totalBytes = 0;
  let limitError = null;
  const deadline = Date.now() + MAX_DOWNLOAD_MS;

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

      try {
        let buffer;
        let mime;
        let url;

        if (item && typeof item === 'object' && Buffer.isBuffer(item.buffer)) {
          buffer = item.buffer;
          mime = item.mime || detectImageMime(buffer);
          url = item.url || `page-${index + 1}`;
        } else {
          buffer = await downloadImage(item, quality);
          mime = detectImageMime(buffer);
          url = item;
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
          url,
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
      }
    }
  });

  await Promise.all(workers);
  return results.filter(Boolean);
}

async function createPdfFromImages(imageUrls, outputPath, title, quality = 'sd') {
  const downloaded = await downloadImagesConcurrently(imageUrls, quality);
  const validImages = [];

  // pdfkit solo admite PNG y JPEG.
  for (const { url, buffer, mime } of downloaded) {
    if (mime !== 'image/png' && mime !== 'image/jpeg') {
      console.warn(`Imagen omitida en PDF (${mime || 'formato desconocido'}): ${url}`);
      continue;
    }

    validImages.push(buffer);
  }

  const pdf = new PDFDocument({ size: 'A4', margin: 20 });
  const stream = fs.createWriteStream(outputPath);
  pdf.pipe(stream);

  if (!validImages.length) {
    pdf.fontSize(18).text(title || DEFAULT_TITLE, { align: 'center' });
    pdf.moveDown();
    pdf.fontSize(12).text('No se encontraron imágenes válidas para generar este documento.', { align: 'center' });
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
      pdf.end();
    });
    return;
  }

  for (let index = 0; index < validImages.length; index += 1) {
    const buffer = validImages[index];
    if (index > 0) pdf.addPage();
    pdf.image(buffer, 20, 20, { fit: [pdf.page.width - 40, pdf.page.height - 60], align: 'center', valign: 'center' });
  }

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
    pdf.end();
  });
}

const PPTX_IMAGE_BOX = { x: 0.5, y: 0.8, w: 12.33, h: 6.5 };
const DOCX_IMAGE_BOX = { x: 0, y: 0, w: 500, h: 300 };

async function createPptxFromImages(imageUrls, outputPath, title, quality = 'sd') {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'SlideDownloader';
  pptx.company = 'SlideDownloader';
  pptx.subject = 'Presentation export';
  pptx.title = title || DEFAULT_TITLE;

  const downloaded = await downloadImagesConcurrently(imageUrls, quality);
  const validImages = [];

  // pptxgenjs + PowerPoint admiten de forma fiable PNG y JPEG.
  for (const { url, buffer, mime, width, height } of downloaded) {
    if (mime !== 'image/png' && mime !== 'image/jpeg') {
      console.warn(`Imagen omitida en PPTX (${mime || 'formato desconocido'}): ${url}`);
      continue;
    }

    validImages.push({ url, buffer, mime, width, height });
  }

  if (!validImages.length) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addText(title || DEFAULT_TITLE, { x: 0.5, y: 0.5, w: 12, h: 0.5, fontSize: 24, bold: true, color: '000000' });
    slide.addText('No se encontraron imágenes válidas para generar la presentación.', {
      x: 0.5,
      y: 1.5,
      w: 12,
      h: 1,
      fontSize: 16,
      color: '333333'
    });
    await pptx.writeFile({ fileName: outputPath });
    return;
  }

  for (const { buffer, mime, width, height } of validImages) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addText(title || DEFAULT_TITLE, { x: 0.5, y: 0.2, w: 12, h: 0.5, fontSize: 18, bold: true, color: '111827' });

    // Insertar con la proporción real de la imagen, centrada en la caja.
    // Antes se usaba 12.8×6.8 fijo y los mazos 4:3 salían estirados.
    const placement = fitImageWithinBox(width, height, PPTX_IMAGE_BOX);
    slide.addImage({
      data: toDataUri(buffer, mime),
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h
    });
  }

  await pptx.writeFile({ fileName: outputPath });
}

async function createDocxFromImages(imageUrls, outputPath, title, quality = 'sd') {
  const children = [
    new Paragraph({
      text: title || DEFAULT_TITLE,
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 }
    })
  ];

  const downloaded = await downloadImagesConcurrently(imageUrls, quality);
  const validImages = [];

  // docx solo admite imágenes PNG y JPEG de forma fiable.
  for (const { url, buffer, mime, width, height } of downloaded) {
    if (mime !== 'image/png' && mime !== 'image/jpeg') {
      console.warn(`Imagen omitida en DOCX (${mime || 'formato desconocido'}): ${url}`);
      continue;
    }

    validImages.push({ url, buffer, mime, width, height });
  }

  for (let index = 0; index < validImages.length; index += 1) {
    const item = validImages[index];
    const placement = fitImageWithinBox(item.width, item.height, DOCX_IMAGE_BOX);

    children.push(new Paragraph({ text: `Slide ${index + 1}`, heading: HeadingLevel.HEADING_2, spacing: { before: 120, after: 120 } }));
    children.push(new Paragraph({
      children: [
        new ImageRun({
          data: item.buffer,
          transformation: {
            width: Math.max(1, Math.round(placement.w)),
            height: Math.max(1, Math.round(placement.h))
          }
        })
      ],
      spacing: { after: 200 }
    }));
  }

  if (!validImages.length) {
    children.push(new Paragraph({ text: 'No se encontraron imágenes válidas para generar el documento.', spacing: { after: 200 } }));
  }

  const doc = new Document({
    sections: [{ properties: {}, children }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

/**
 * Convertir un PPTX en PPSX o POTX. El paquete es idéntico salvo el tipo
 * de contenido declarado para `ppt/presentation.xml`.
 */
async function convertPptxToVariant(pptxPath, outputPath, variant) {
  const targetContentType = PPTX_VARIANTS[variant];

  if (!targetContentType) {
    throw new Error(`Variante de PowerPoint no soportada: ${variant}`);
  }

  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath));
  const contentTypes = zip.file('[Content_Types].xml');

  if (!contentTypes) {
    throw new Error('El PPTX generado no contiene [Content_Types].xml');
  }

  const xml = await contentTypes.async('string');

  if (!xml.includes(PPTX_CONTENT_TYPE)) {
    throw new Error('El tipo de contenido del PPTX generado no es el esperado');
  }

  zip.file('[Content_Types].xml', xml.split(PPTX_CONTENT_TYPE).join(targetContentType));

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(outputPath, buffer);
}

async function buildPresentationFileFromImages(imageUrls, format, outputDir, title, quality = 'sd') {
  const extension = String(format || 'pdf').toLowerCase();

  if (!SUPPORTED_FORMATS.includes(extension)) {
    throw createServiceError(`Formato no soportado: ${format}`, 400, ERROR_CODES.UNSUPPORTED_FORMAT);
  }

  const outputFile = path.join(outputDir, sanitizeFileName(title || DEFAULT_TITLE, extension));

  if (extension === 'pdf') {
    await createPdfFromImages(imageUrls, outputFile, title, quality);
  } else if (extension === 'pptx') {
    await createPptxFromImages(imageUrls, outputFile, title, quality);
  } else if (extension === 'docx') {
    await createDocxFromImages(imageUrls, outputFile, title, quality);
  } else {
    // PPSX y POTX: se genera un PPTX temporal y se cambia su tipo de contenido.
    const tempPptx = path.join(outputDir, `.__tmp-${Date.now()}-${process.pid}.pptx`);

    try {
      await createPptxFromImages(imageUrls, tempPptx, title, quality);
      await convertPptxToVariant(tempPptx, outputFile, extension);
    } finally {
      fs.rmSync(tempPptx, { force: true });
    }
  }

  return { outputFile, filename: path.basename(outputFile) };
}

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

  const cleanup = () => {
    try {
      fs.rmSync(jobDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('No se pudo limpiar el directorio del trabajo:', error.message);
    }
  };

  try {
    let imageUrls = providedImages;
    let title = providedTitle || DEFAULT_TITLE;
    let slideTexts = [];
    const textWarnings = [];

    // En la exportación de texto, un título ya detectado evita repetir la
    // inspección de la URL cuando el cliente no aportó imágenes.
    if (!imageUrls.length && !(TEXT_FORMATS.includes(extension) && providedTitle)) {
      let info = null;

      const rendererConfigured = Boolean(process.env.RENDERER_URL);

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
      const warnings = [...textWarnings];
      const ocrEnabled = process.env.OCR_ENABLED === 'true';
      let source = 'metadata';

      if (ocrEnabled && imageUrls.length) {
        let engine = null;

        try {
          const cacheDir = String(process.env.OCR_CACHE_DIR || '').trim()
            || path.join(DOWNLOADS_DIR, '.ocr-cache');

          engine = createOcrEngine({
            enabled: true,
            lang: process.env.OCR_LANG,
            maxSlides: process.env.OCR_MAX_SLIDES,
            timeoutMs: process.env.OCR_TIMEOUT_MS,
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
        downloadUrl: `/download/${jobId}/${textFile.filename}`
      };
    }

    const result = await buildPresentationFileFromImages(imageUrls, extension, jobDir, title, selectedQuality);

    return {
      success: true,
      jobId,
      title,
      format: extension,
      quality: selectedQuality,
      source: providedImages.length ? 'preview' : 'renderer',
      imageCount: imageUrls.length,
      fileName: result.filename,
      filePath: result.outputFile,
      // Se conserva por compatibilidad; la API envía el archivo en la misma
      // respuesta y borra el directorio del trabajo.
      downloadUrl: `/download/${jobId}/${result.filename}`
    };
  } catch (error) {
    // No dejar carpetas vacías cuando la generación falla.
    cleanup();
    throw error;
  }
}

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
