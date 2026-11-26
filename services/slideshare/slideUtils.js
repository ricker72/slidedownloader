const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const {
  DOWNLOADS_DIR,
  DEFAULT_TITLE,
  MAX_SLIDES
} = require('../../config');

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

module.exports = {
  dedupeUrls,
  isLikelyImageUrl,
  normalizeSlideShareUrl,
  selectSlideImages,
  applyImageQuality,
  getImageCandidates,
  sanitizeProvidedImageUrls,
  isRemoteHttpUrl,
  cleanSlideTitle,
  sanitizeFileName,
  buildJobDir,
  cleanupOldJobs
};
