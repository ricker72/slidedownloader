/**
 * Servicio de descarga de documentos públicos de Scribd.
 *
 * Estrategia (sin login, sin cookies y sin credenciales):
 * 1. Se lee el visor embebido (`/embeds/{id}/content`), que es la vista pública
 *    que Scribd entrega a cualquier visitante.
 * 2. Se obtiene la lista de páginas desde `/document_downloads/{id}` (incluye el
 *    hash de las imágenes renderizadas) y, si falta alguna, desde el visor.
 * 3. Cada página se materializa como imagen:
 *    - Imagen renderizada del CDN (`/images/{n}-{hash}.jpg` o `.png`).
 *    - Si no existe (documentos de solo texto), se reconstruye la página a
 *      partir de su capa de texto y se rasteriza con `sharp`.
 * 4. El archivo final (PDF/PPTX/PPSX/POTX/DOCX) se genera con el pipeline ya
 *    existente de `slideshareService`.
 *
 * LÍMITES CONOCIDOS:
 * - Algunos documentos de solo texto entregan la capa de texto "cifrada" por
 *   sustitución de caracteres (Scribd los renderiza con una fuente propia).
 *   Esos documentos no se pueden reconstruir sin producir texto ilegible, así
 *   que se rechazan con un mensaje explícito.
 * - Solo se admiten documentos públicos. Si el autor no permite la descarga,
 *   se devuelve 403 y se enlaza al documento original.
 */

const fs = require('fs');
const https = require('https');
const zlib = require('zlib');
const sharp = require('sharp');

const {
  buildJobDir,
  buildPresentationFileFromImages,
  detectImageMime
} = require('./slideshareService');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const SUPPORTED_FORMATS = ['pdf', 'pptx', 'ppsx', 'potx', 'docx'];
const MAX_PAGES = 60;
const CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_ASSET_IMAGES_PER_PAGE = 10;
const CONTEXT_TTL_MS = 5 * 60 * 1000;
const CONTEXT_CACHE_LIMIT = 20;

const SCRIBD_HOST_RE = /^(?:[a-z0-9-]+\.)*scribd\.com$/i;
const ASSET_HOST_RE = /^(?:[a-z0-9-]+\.)*scribdassets\.com$/i;
const LEGACY_HTML_HOST_RE = /^https?:\/\/html\.scribd\.com\//i;

// El visor escala la capa de texto con `transform: scale(.2)`.
const TEXT_LAYER_SCALE = 0.2;
const DEFAULT_PAGE_WIDTH = 902;
const DEFAULT_PAGE_HEIGHT = 1167;

const STOPWORDS = new Set([
  // Español
  'de', 'la', 'el', 'en', 'que', 'los', 'las', 'por', 'con', 'para', 'una', 'un',
  'su', 'al', 'del', 'se', 'es', 'como', 'más', 'mas', 'pero', 'sin', 'sobre',
  'este', 'esta', 'estos', 'estas', 'son', 'fue', 'ser', 'hay', 'cada', 'desde',
  // Inglés
  'the', 'and', 'of', 'to', 'in', 'is', 'for', 'that', 'with', 'this', 'are',
  'was', 'from', 'you', 'your', 'can', 'not', 'will', 'have', 'has', 'its',
  // Portugués / Francés
  'os', 'as', 'um', 'uma', 'não', 'nao', 'com', 'les', 'des', 'une', 'est',
  'dans', 'pour', 'par', 'sur', 'pas', 'qui', 'que',
  // Alemán / Italiano / Neerlandés
  'der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'von', 'den', 'dem',
  'ein', 'eine', 'zu', 'auf', 'auch', 'als', 'sich', 'werden', 'wird',
  'il', 'lo', 'gli', 'di', 'che', 'per', 'con', 'non', 'una', 'del', 'della',
  'het', 'een', 'van', 'voor', 'met', 'niet', 'zijn', 'wordt', 'door'
]);

function createScribdError(message, status = 500, code = null) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

/* ------------------------------------------------------------------ *
 * Validación de enlaces
 * ------------------------------------------------------------------ */

/**
 * Normaliza un enlace de Scribd y extrae el id numérico del documento.
 * Acepta `scribd.com`, `es.scribd.com`, `pt.scribd.com`… y las rutas
 * `/document/{id}`, `/doc/{id}` y `/presentation/{id}`.
 *
 * @returns {{ documentId: string, canonicalUrl: string } | null}
 */
function normalizeScribdUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;

  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port) return null;
  if (!SCRIBD_HOST_RE.test(parsed.hostname)) return null;

  const match = parsed.pathname.match(/^\/(document|doc|presentation)\/(\d{1,12})(?:\/|$)/i);
  if (!match) return null;

  const documentId = String(Number(match[2]));
  if (!documentId || documentId === '0') return null;

  const kind = match[1].toLowerCase() === 'presentation' ? 'presentation' : 'document';

  return {
    documentId,
    canonicalUrl: `https://www.scribd.com/${kind}/${documentId}`
  };
}

/* ------------------------------------------------------------------ *
 * Descarga HTTP con límites y validación de destino (anti-SSRF)
 * ------------------------------------------------------------------ */

function normalizeAssetUrl(value) {
  if (!value || typeof value !== 'string') return null;

  let candidate = value.trim().replace(/&amp;/g, '&');
  if (candidate.startsWith('//')) candidate = `https:${candidate}`;
  if (LEGACY_HTML_HOST_RE.test(candidate)) {
    candidate = candidate.replace(
      /^http:\/\/html\.scribd\.com\//i,
      'https://html.scribdassets.com/'
    );
  } else if (/^http:\/\/html\.scribdassets\.com\//i.test(candidate)) {
    candidate = `https://${candidate.slice('http://'.length)}`;
  }

  return candidate;
}

function assertAllowedHost(hostname) {
  return SCRIBD_HOST_RE.test(hostname) || ASSET_HOST_RE.test(hostname);
}

/**
 * Perfil TLS equivalente al de Chrome.
 *
 * Scribd sirve un reto JavaScript ("Client Challenge") a la huella TLS por
 * defecto de Node; con el orden de cifrados, curvas y algoritmos de firma que
 * usa Chrome la vista pública responde con normalidad. No se resuelve ni se
 * evita ningún mecanismo de autenticación: solo se negocia TLS como un
 * navegador estándar.
 */
const CHROME_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-RSA-AES128-SHA',
  'ECDHE-RSA-AES256-SHA',
  'AES128-GCM-SHA256',
  'AES256-GCM-SHA384',
  'AES128-SHA',
  'AES256-SHA'
].join(':');

const CHROME_SIGNATURE_ALGORITHMS = [
  'ECDSA+SHA256',
  'RSA-PSS+SHA256',
  'RSA+SHA256',
  'ECDSA+SHA384',
  'RSA-PSS+SHA384',
  'RSA+SHA384',
  'ECDSA+SHA512',
  'RSA-PSS+SHA512',
  'RSA+SHA512'
].join(':');

const TLS_OPTIONS = {
  ciphers: CHROME_CIPHERS,
  ecdhCurve: 'X25519:P-256:P-384',
  sigalgs: CHROME_SIGNATURE_ALGORITHMS,
  minVersion: 'TLSv1.2',
  maxVersion: 'TLSv1.3'
};

/**
 * Descomprime el cuerpo según `content-encoding`.
 *
 * El CDN de Scribd sirve los JSONP con gzip aunque se solicite `identity`,
 * así que ignorar esta cabecera dejaría el HTML comprimido e ilegible.
 */
function decodeContentEncoding(buffer, encoding, maxBytes) {
  const value = String(encoding || '').trim().toLowerCase();
  if (!value || value === 'identity') return buffer;

  // `maxOutputLength` evita que un cuerpo comprimido malicioso agote la memoria.
  const options = { maxOutputLength: maxBytes + 1 };

  try {
    if (value === 'gzip' || value === 'x-gzip') return zlib.gunzipSync(buffer, options);
    if (value === 'deflate') return zlib.inflateSync(buffer, options);
    if (value === 'br') return zlib.brotliDecompressSync(buffer, options);
  } catch (error) {
    if (error && error.code === 'ERR_BUFFER_TOO_LARGE') {
      throw createScribdError('La respuesta de Scribd es demasiado grande.', 502);
    }
    throw createScribdError('No se pudo descomprimir la respuesta de Scribd.', 502);
  }

  throw createScribdError('Codificación de respuesta de Scribd no soportada.', 502);
}

/**
 * Transporte HTTP por defecto: `https` nativo de Node.
 *
 * Se usa en lugar de `fetch` porque permite controlar el perfil TLS (ver
 * arriba) y evita depender de clientes externos.
 *
 * @returns {Promise<{ status: number, headers: object, buffer: Buffer }>}
 */
function createNodeTransport() {
  return function transport(resourceUrl, { headers = {}, maxBytes = MAX_HTML_BYTES, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
    return new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = new URL(resourceUrl);
      } catch {
        reject(createScribdError('Recurso de Scribd no válido.', 502));
        return;
      }

      if (parsed.protocol !== 'https:') {
        reject(createScribdError('Recurso de Scribd no permitido.', 502));
        return;
      }

      const request = https.request(
        {
          protocol: 'https:',
          hostname: parsed.hostname,
          port: parsed.port || 443,
          path: `${parsed.pathname}${parsed.search}`,
          method: 'GET',
          headers: { 'Accept-Encoding': 'gzip, deflate, br', ...headers },
          ...TLS_OPTIONS
        },
        (response) => {
          const status = response.statusCode || 0;

          if (status >= 300) {
            response.resume();
            resolve({ status, headers: response.headers, buffer: Buffer.alloc(0) });
            return;
          }

          const declared = Number(response.headers['content-length']);
          if (Number.isFinite(declared) && declared > maxBytes) {
            response.resume();
            reject(createScribdError('La respuesta de Scribd es demasiado grande.', 502));
            return;
          }

          const chunks = [];
          let total = 0;

          response.on('data', (chunk) => {
            total += chunk.length;
            if (total > maxBytes) {
              request.destroy(createScribdError('La respuesta de Scribd es demasiado grande.', 502));
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => {
            let buffer;
            try {
              buffer = decodeContentEncoding(
                Buffer.concat(chunks),
                response.headers['content-encoding'],
                maxBytes
              );
            } catch (error) {
              reject(error);
              return;
            }

            if (buffer.length > maxBytes) {
              reject(createScribdError('La respuesta de Scribd es demasiado grande.', 502));
              return;
            }

            resolve({ status, headers: response.headers, buffer });
          });
          response.on('error', reject);
        }
      );

      request.setTimeout(timeoutMs, () => {
        const timeoutError = new Error('Timeout al pedir el documento a Scribd');
        timeoutError.code = 'ETIMEDOUT';
        request.destroy(timeoutError);
      });
      request.on('error', reject);
      request.end();
    });
  };
}

function mapHttpError(status) {
  if (status === 404 || status === 410) {
    return createScribdError('El documento no existe o fue retirado de Scribd.', 404);
  }
  if (status === 401 || status === 403) {
    return createScribdError(
      'Scribd bloqueó la petición o el documento no es público.',
      403
    );
  }
  if (status === 429) {
    return createScribdError('Scribd limitó las peticiones. Intenta de nuevo en un minuto.', 429);
  }
  return createScribdError(`Scribd respondió con un error (HTTP ${status}).`, 502);
}

/**
 * Descarga binaria con timeout, límite de tamaño y validación de cada salto
 * de redirección. Cualquier host fuera de scribd.com / scribdassets.com se
 * rechaza antes de descargar nada.
 */
async function requestBuffer(transport, resourceUrl, options = {}) {
  const { maxBytes = MAX_HTML_BYTES, accept = 'text/html', referer = null } = options;

  let current = resourceUrl;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    let parsed;
    try {
      parsed = new URL(current);
    } catch {
      throw createScribdError('Recurso de Scribd no válido.', 502);
    }

    if (!assertAllowedHost(parsed.hostname)) {
      throw createScribdError('Recurso de Scribd no permitido.', 502);
    }

    let response;
    try {
      response = await transport(current, {
        maxBytes,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: accept,
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
          ...(referer ? { Referer: referer } : {})
        }
      });
    } catch (error) {
      if (error.code === 'ETIMEDOUT') {
        throw createScribdError('Scribd tardó demasiado en responder.', 504);
      }
      throw error;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location || response.headers.Location;
      if (!location) throw createScribdError('Redirección de Scribd no válida.', 502);
      current = new URL(location, current).href;
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      throw mapHttpError(response.status);
    }

    return response.buffer;
  }

  throw createScribdError('Demasiadas redirecciones al pedir el documento a Scribd.', 502);
}

async function requestText(transport, resourceUrl, options = {}) {
  const buffer = await requestBuffer(transport, resourceUrl, options);
  return buffer.toString('utf8');
}

/* ------------------------------------------------------------------ *
 * Parsers del HTML del visor
 * ------------------------------------------------------------------ */

/** Encuentra la llave de cierre que equilibra la de apertura. */
function findMatchingBrace(source, startIndex) {
  if (startIndex < 0) return -1;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

/**
 * Extrae la configuración del visor embebido: título, número de páginas,
 * permiso de descarga, miniatura y prefijo de assets.
 */
function extractEmbedConfig(html) {
  const config = {
    documentId: null,
    title: '',
    pageCount: 0,
    downloadable: null,
    thumbnailUrl: null,
    assetPrefix: null
  };

  const marker = 'new Scribd.EmbedsShow(';
  const markerIndex = html.indexOf(marker);

  if (markerIndex !== -1) {
    const start = html.indexOf('{', markerIndex + marker.length);
    const end = findMatchingBrace(html, start);

    if (start !== -1 && end !== -1) {
      try {
        const parsed = JSON.parse(html.slice(start, end + 1));
        const document = parsed.document || {};
        const toolbar = parsed.toolbar || {};

        config.documentId = document.id ? String(document.id) : null;
        config.title = typeof document.title === 'string' ? document.title : '';
        config.pageCount = Number(document.page_count) || 0;
        config.downloadable =
          typeof toolbar.downloadable === 'boolean' ? toolbar.downloadable : null;
        config.thumbnailUrl =
          toolbar.share_opts && toolbar.share_opts.thumbnail_url
            ? toolbar.share_opts.thumbnail_url
            : null;
      } catch {
        /* se completan los campos con las expresiones regulares de abajo */
      }
    }
  }

  const prefixMatch = html.match(/docManager\.assetPrefix\s*=\s*"([^"]+)"/);
  if (prefixMatch) config.assetPrefix = prefixMatch[1];

  if (!config.pageCount) {
    const pageCountMatch =
      html.match(/"page_count"\s*:\s*(\d+)/) || html.match(/"pageCount"\s*:\s*(\d+)/);
    if (pageCountMatch) config.pageCount = Number(pageCountMatch[1]);
  }

  if (config.downloadable === null) {
    const downloadableMatch = html.match(/"downloadable"\s*:\s*(true|false)/);
    if (downloadableMatch) config.downloadable = downloadableMatch[1] === 'true';
  }

  if (!config.thumbnailUrl) {
    const thumbMatch = html.match(/"thumbnail_url"\s*:\s*"(https:[^"]+)"/);
    if (thumbMatch) config.thumbnailUrl = thumbMatch[1];
  }

  return config;
}

/**
 * Devuelve el trozo de HTML que contiene una página incrustada en el visor.
 * Las páginas se sirven en línea hasta la siguiente llamada a `addPage`.
 */
function extractInlineMarkup(html, pageNum, lowerBound, upperBound) {
  const marker = `id="outer_page_${pageNum}"`;
  const markerIndex = html.indexOf(marker, lowerBound);

  let start = lowerBound;
  if (markerIndex !== -1 && markerIndex < upperBound) {
    start = Math.max(lowerBound, html.lastIndexOf('<div', markerIndex));
  }

  const markup = html.slice(start, upperBound);
  return markup.trim() ? markup : null;
}

/**
 * Extrae las páginas declaradas por el visor: número, URL del JSONP con su
 * contenido y metadatos de tamaño.
 */
function extractPageManifest(html) {
  const pages = [];
  const seen = new Set();
  const callRe = /docManager\.addPage\(\{([\s\S]*?)\}\);/g;

  let match;
  let previousEnd = 0;

  while ((match = callRe.exec(html)) !== null) {
    const body = match[1];
    const pageNum = Number((body.match(/pageNum:\s*(\d+)/) || [])[1]);

    if (!Number.isInteger(pageNum) || pageNum < 1 || seen.has(pageNum)) {
      previousEnd = callRe.lastIndex;
      continue;
    }

    const contentUrl = (body.match(/contentUrl:\s*"([^"]+)"/) || [])[1] || null;
    const width = Number((body.match(/origWidth:\s*(\d+)/) || [])[1]) || 0;
    const height = Number((body.match(/origHeight:\s*(\d+)/) || [])[1]) || 0;

    pages.push({
      pageNum,
      contentUrl: contentUrl ? normalizeAssetUrl(contentUrl) : null,
      inlineHtml: contentUrl
        ? null
        : extractInlineMarkup(html, pageNum, previousEnd, match.index),
      width,
      height
    });

    seen.add(pageNum);
    previousEnd = callRe.lastIndex;
  }

  return pages.sort((a, b) => a.pageNum - b.pageNum);
}

/** Convierte `window.pageN_callback(["<html>"])` en el HTML de la página. */
function parseJsonpMarkup(source) {
  if (typeof source !== 'string') return null;

  const start = source.indexOf('(');
  const end = source.lastIndexOf(')');
  if (start === -1 || end <= start) return null;

  try {
    const payload = JSON.parse(source.slice(start + 1, end));
    if (Array.isArray(payload) && typeof payload[0] === 'string') return payload[0];
    if (typeof payload === 'string') return payload;
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Capa de texto y rasterizado de páginas sin imagen
 * ------------------------------------------------------------------ */

const NAMED_ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'"
};

function decodeEntities(value) {
  return String(value).replace(
    /&(?:nbsp|amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,
    (entity) => {
      const named = NAMED_ENTITIES[entity.toLowerCase()];
      if (named) return named;

      const hex = entity.match(/^&#x([0-9a-f]+);$/i);
      if (hex) return String.fromCodePoint(parseInt(hex[1], 16));

      const dec = entity.match(/^&#(\d+);$/);
      if (dec) return String.fromCodePoint(Number(dec[1]));

      return entity;
    }
  );
}

function stripTags(value) {
  return decodeEntities(String(value).replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function findClosingSpan(html, from) {
  const tagRe = /<span\b[^>]*>|<\/span>/gi;
  tagRe.lastIndex = from;

  let depth = 1;
  let tag;

  while ((tag = tagRe.exec(html)) !== null) {
    if (tag[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) return tag.index;
    } else {
      depth += 1;
    }
  }

  return -1;
}

function sanitizeColor(value) {
  if (typeof value !== 'string') return '#111111';
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value;
  if (/^rgba?\(\s*[\d.\s,%]+\)$/i.test(value)) return value;
  return '#111111';
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convierte la capa de texto del visor en posiciones absolutas de la página.
 * El HTML usa coordenadas multiplicadas por 5 (`transform: scale(.2)`).
 */
function parseTextLayer(html, pageWidth = DEFAULT_PAGE_WIDTH, pageHeight = DEFAULT_PAGE_HEIGHT) {
  const runs = [];
  const tokenRe = /<div\s+class="?ff\d+"?[^>]*?font-size:\s*([\d.]+)px[^>]*>|<span\b([^>]*)>/gi;

  let currentSize = 16;
  let token;

  while ((token = tokenRe.exec(html)) !== null) {
    if (token[1] !== undefined) {
      const size = Number(token[1]);
      if (Number.isFinite(size) && size > 0) currentSize = size;
      continue;
    }

    const attrs = token[2] || '';
    if (!/\bleft\s*:/.test(attrs) || !/\btop\s*:/.test(attrs)) continue;

    const end = findClosingSpan(html, tokenRe.lastIndex);
    if (end === -1) continue;

    const text = stripTags(html.slice(tokenRe.lastIndex, end));
    tokenRe.lastIndex = end + '</span>'.length;
    if (!text) continue;

    const left = Number((attrs.match(/left:\s*(-?[\d.]+)px/) || [])[1]);
    const top = Number((attrs.match(/top:\s*(-?[\d.]+)px/) || [])[1]);
    if (!Number.isFinite(left) || !Number.isFinite(top)) continue;

    const x = left * TEXT_LAYER_SCALE;
    const y = top * TEXT_LAYER_SCALE;
    if (x < -40 || y < -40 || x > pageWidth + 40 || y > pageHeight + 40) continue;

    const fontSize = Math.min(currentSize * TEXT_LAYER_SCALE, pageHeight);
    if (fontSize < 1) continue;

    runs.push({
      text,
      x: Math.max(0, x),
      y: Math.max(0, y),
      fontSize,
      color: sanitizeColor((attrs.match(/color:\s*([^;"]+)/) || [])[1])
    });
  }

  return runs;
}

/** Imágenes superpuestas de la página (`.image_layer img`). */
function parseImageLayer(html) {
  const images = [];
  const imgRe = /<img\b([^>]*)>/gi;
  let match;

  while ((match = imgRe.exec(html)) !== null) {
    const attrs = match[1];
    const src =
      (attrs.match(/\borig="([^"]+)"/i) || [])[1] ||
      (attrs.match(/\bsrc="([^"]+)"/i) || [])[1];
    if (!src) continue;

    const style = (attrs.match(/\bstyle="([^"]*)"/i) || [])[1] || '';
    const left = Number((style.match(/left:\s*(-?[\d.]+)px/) || [])[1]);
    const top = Number((style.match(/top:\s*(-?[\d.]+)px/) || [])[1]);
    const width = Number((style.match(/width:\s*([\d.]+)px/) || [])[1]);
    const height = Number((style.match(/height:\s*([\d.]+)px/) || [])[1]);

    if (!Number.isFinite(left) || !Number.isFinite(top)) continue;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;

    const normalized = normalizeAssetUrl(decodeEntities(src));
    if (!normalized || !/^https:\/\//i.test(normalized)) continue;

    images.push({ src: normalized, left, top, width, height });
  }

  return images;
}

function normalizeWord(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Detecta si la capa de texto viene cifrada por sustitución (Scribd la dibuja
 * con una fuente propia). Renderizarla con una fuente estándar produciría
 * texto ilegible, así que se descarta en lugar de generar basura.
 */
function looksObfuscated(text, title = '') {
  const plain = normalizeWord(text);
  if (plain.length < 120) return false;

  const titleWords = normalizeWord(title)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 5);

  if (titleWords.some((word) => plain.includes(word))) return false;

  const tokens = plain.split(/[^a-z0-9áéíóúüñ]+/).filter(Boolean).slice(0, 400);
  if (!tokens.length) return false;

  const hits = tokens.filter((token) => STOPWORDS.has(token)).length;
  return hits / tokens.length < 0.05;
}

async function toDataUri(transport, imageUrl) {
  const buffer = await requestBuffer(transport, imageUrl, {
    accept: 'image/jpeg,image/png,image/*;q=0.8',
    maxBytes: MAX_IMAGE_BYTES
  });

  const mime = detectImageMime(buffer);
  if (!mime) throw createScribdError('Imagen de Scribd con formato desconocido.', 502);

  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function buildPageSvg({ runs, images, width, height }) {
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`
  ];

  for (const image of images) {
    parts.push(
      `<image x="${image.left}" y="${image.top}" width="${image.width}" height="${image.height}" preserveAspectRatio="none" href="${image.href}"/>`
    );
  }

  for (const run of runs) {
    const baseline = run.y + run.fontSize * 0.8;
    parts.push(
      `<text x="${run.x}" y="${baseline.toFixed(2)}" font-family="sans-serif" font-size="${run.fontSize.toFixed(2)}" fill="${run.color}">${escapeXml(run.text)}</text>`
    );
  }

  parts.push('</svg>');
  return parts.join('');
}

async function countInkPixels(pngBuffer) {
  const { data, info } = await sharp(pngBuffer)
    .flatten({ background: '#ffffff' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let ink = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    if (data[index] < 240) ink += 1;
  }
  return ink;
}

/**
 * Reconstruye una página sin imagen renderizada a partir de su HTML y la
 * devuelve como PNG.
 */
async function renderPageToPng(page, markup, transport, options = {}) {
  const width = page.width || DEFAULT_PAGE_WIDTH;
  const height = page.height || DEFAULT_PAGE_HEIGHT;

  const runs = parseTextLayer(markup, width, height);
  const rawImages = parseImageLayer(markup).slice(0, MAX_ASSET_IMAGES_PER_PAGE);

  if (!runs.length && !rawImages.length) {
    // Una página realmente vacía (sin texto ni imágenes) se conserva como
    // página en blanco para no alterar la numeración del documento.
    if (!stripTags(markup)) {
      return sharp({
        create: { width, height, channels: 3, background: '#ffffff' }
      })
        .png()
        .toBuffer();
    }

    throw createScribdError('No se pudo interpretar el contenido de la página.', 502);
  }

  if (options.obfuscated && runs.length) {
    throw createScribdError(
      'Este documento usa texto protegido por Scribd y no se puede reconstruir.',
      422
    );
  }

  const images = [];
  for (const image of rawImages) {
    try {
      images.push({ ...image, href: await toDataUri(transport, image.src) });
    } catch {
      /* una imagen suelta no invalida la página */
    }
  }

  const svg = buildPageSvg({ runs, images, width, height });
  const png = await sharp(Buffer.from(svg), { density: 72 }).png().toBuffer();

  if (!runs.length) return png;

  const ink = await countInkPixels(png);
  if (ink === 0) {
    throw createScribdError(
      'No se pudo rasterizar el texto de la página (fuentes no disponibles).',
      502
    );
  }

  return png;
}

/* ------------------------------------------------------------------ *
 * Obtención de páginas
 * ------------------------------------------------------------------ */

function pageImageCandidates(page) {
  if (!page.contentUrl) return [];

  const match = page.contentUrl.match(
    /^(https:\/\/[^/]+)\/(.+?)\/pages\/(\d+)-([a-z0-9]+)\.jsonp$/i
  );
  if (!match) return [];

  const [, origin, prefix, pageNumber, hash] = match;
  return [
    `${origin}/${prefix}/images/${pageNumber}-${hash}.jpg`,
    `${origin}/${prefix}/images/${pageNumber}-${hash}.png`
  ];
}

async function fetchPageMarkup(page, transport) {
  if (page.inlineHtml) return page.inlineHtml;
  if (!page.contentUrl) return null;

  const source = await requestText(transport, page.contentUrl, {
    accept: 'application/javascript,text/javascript,*/*;q=0.8',
    maxBytes: MAX_HTML_BYTES
  });

  return parseJsonpMarkup(source);
}

async function loadPageImage(page, transport, options = {}) {
  for (const candidate of pageImageCandidates(page)) {
    try {
      const buffer = await requestBuffer(transport, candidate, {
        accept: 'image/jpeg,image/png,image/*;q=0.8',
        maxBytes: MAX_IMAGE_BYTES
      });
      const mime = detectImageMime(buffer);

      // El CDN devuelve XML de error con 200 en algunos casos: se descarta.
      if (mime === 'image/png' || mime === 'image/jpeg') {
        return { pageNum: page.pageNum, buffer, mime };
      }
    } catch {
      /* se prueba el siguiente candidato o el rasterizado */
    }
  }

  const markup = await fetchPageMarkup(page, transport);
  if (!markup) {
    throw createScribdError('Scribd no entregó el contenido de esta página.', 502);
  }

  // Algunos documentos de solo texto cifran la capa de texto por sustitución.
  // Se detecta página a página para no rechazar documentos legibles.
  const obfuscated =
    options.obfuscated || looksObfuscated(stripTags(markup), options.title || '');

  const png = await renderPageToPng(page, markup, transport, { ...options, obfuscated });
  return { pageNum: page.pageNum, buffer: png, mime: 'image/png' };
}

async function materializePages(pages, transport, options = {}) {
  const results = new Array(pages.length).fill(null);
  const warnings = [];
  let cursor = 0;
  let blocked = 0;

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, pages.length) },
    async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= pages.length) return;

        const page = pages[index];

        try {
          results[index] = await loadPageImage(page, transport, options);
        } catch (error) {
          if (error.status === 422 && /texto protegido/i.test(error.message)) blocked += 1;
          warnings.push(`Página ${page.pageNum}: ${error.message}`);
        }
      }
    }
  );

  await Promise.all(workers);

  return {
    images: results.filter(Boolean),
    warnings: warnings.slice(0, 8),
    blocked
  };
}

/* ------------------------------------------------------------------ *
 * Contexto del documento (con caché corta en memoria)
 * ------------------------------------------------------------------ */

const contextCache = new Map();

function cacheGet(documentId) {
  const entry = contextCache.get(documentId);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    contextCache.delete(documentId);
    return null;
  }

  return entry.value;
}

function cacheSet(documentId, value) {
  if (contextCache.size >= CONTEXT_CACHE_LIMIT) {
    const oldest = contextCache.keys().next();
    if (!oldest.done) contextCache.delete(oldest.value);
  }

  contextCache.set(documentId, { value, expiresAt: Date.now() + CONTEXT_TTL_MS });
}

function extractTitle(html) {
  const match = html.match(/"extracted_title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!match) return '';

  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

function extractFormats(html) {
  const formats = [];
  const block = html.match(/"formats"\s*:\s*\[([\s\S]*?)\]/);
  if (!block) return formats;

  const re = /"extension"\s*:\s*"([a-z0-9]+)"/gi;
  let match;
  while ((match = re.exec(block[1])) !== null) {
    formats.push(match[1].toLowerCase());
  }
  return formats;
}

function cleanScribdTitle(value) {
  const title = String(value || '')
    .replace(/\s*\|\s*Scribd\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Algunos documentos ocultan el título con puntos suspensivos.
  if (!title || /^[.\s·-]+$/.test(title)) return '';
  return title;
}

async function loadDocumentContext(documentId, transport) {
  const cached = cacheGet(documentId);
  if (cached) return cached;

  const embedUrl = `https://www.scribd.com/embeds/${documentId}/content?start_page=1&view_mode=scroll`;
  const embedHtml = await requestText(transport, embedUrl, {
    accept: 'text/html,application/xhtml+xml',
    maxBytes: MAX_HTML_BYTES
  });

  const config = extractEmbedConfig(embedHtml);
  const embedPages = extractPageManifest(embedHtml);

  let downloadHtml = '';
  try {
    downloadHtml = await requestText(
      transport,
      `https://www.scribd.com/document_downloads/${documentId}?extension=pdf`,
      { accept: 'text/html,application/xhtml+xml', maxBytes: MAX_HTML_BYTES, referer: embedUrl }
    );
  } catch (error) {
    // Documentos retirados o sin permiso de descarga: el visor sigue sirviendo.
    if (error.status === 404) throw error;
  }

  const downloadPages = downloadHtml ? extractPageManifest(downloadHtml) : [];
  const pages = downloadPages.length >= embedPages.length ? downloadPages : embedPages;

  if (!pages.length) {
    // Scribd sirve una página «Client Challenge» a las IPs de centros de datos
    // (por ejemplo, la salida de Vercel). No es un documento retirado: conviene
    // distinguirlo para no culpar al enlace cuando el bloqueo es del servidor.
    const challenged =
      /Client Challenge/i.test(embedHtml.slice(0, 8000)) ||
      /Client Challenge/i.test(downloadHtml.slice(0, 8000));

    if (challenged) {
      throw createScribdError(
        'Scribd bloqueó la petición desde el servidor desplegado. El descargador funciona ejecutándolo en local; despliega la aplicación en una IP no desafiada por Scribd.',
        403
      );
    }

    throw createScribdError(
      'No se pudieron leer las páginas del documento. Puede que Scribd lo haya retirado.',
      404
    );
  }

  const title =
    cleanScribdTitle(extractTitle(downloadHtml)) ||
    cleanScribdTitle(config.title) ||
    `scribd-${documentId}`;

  const downloadable =
    config.downloadable !== null
      ? config.downloadable
      : /"is_downloadable"\s*:\s*true/i.test(downloadHtml) ||
        !/"is_downloadable"\s*:\s*false/i.test(downloadHtml);

  // Detección de texto cifrado usando las páginas que ya vienen en el HTML.
  const inlineText = pages
    .map((page) => (page.inlineHtml ? stripTags(page.inlineHtml) : ''))
    .join(' ');

  const context = {
    documentId,
    title,
    pageCount: config.pageCount || pages.length,
    downloadable,
    thumbnailUrl: config.thumbnailUrl,
    formats: extractFormats(downloadHtml),
    canonicalUrl: `https://www.scribd.com/document/${documentId}`,
    pages,
    obfuscated: inlineText.length > 120 ? looksObfuscated(inlineText, title) : false
  };

  cacheSet(documentId, context);
  return context;
}

/* ------------------------------------------------------------------ *
 * API pública
 * ------------------------------------------------------------------ */

function createScribdService({ transport = createNodeTransport() } = {}) {
  if (typeof transport !== 'function') {
    throw new Error('Se requiere un transporte HTTP para el servicio de Scribd');
  }

  async function inspect(rawUrl) {
    const normalized = normalizeScribdUrl(rawUrl);
    if (!normalized) {
      throw createScribdError(
        'El enlace no es válido de Scribd. Usa /document/, /doc/ o /presentation/ seguido del id, por ejemplo https://es.scribd.com/document/123456789/...',
        400
      );
    }

    const context = await loadDocumentContext(normalized.documentId, transport);

    return {
      documentId: context.documentId,
      title: context.title,
      pageCount: context.pageCount,
      downloadable: context.downloadable,
      thumbnailUrl: context.thumbnailUrl,
      formats: context.formats,
      canonicalUrl: normalized.canonicalUrl,
      maxPages: MAX_PAGES,
      supportedFormats: SUPPORTED_FORMATS.slice()
    };
  }

  async function download({ url, format } = {}) {
    const normalized = normalizeScribdUrl(url);
    if (!normalized) {
      throw createScribdError(
        'El enlace no es válido de Scribd. Usa /document/, /doc/ o /presentation/ seguido del id.',
        400
      );
    }

    const selectedFormat = String(format || 'pdf').toLowerCase();
    if (!SUPPORTED_FORMATS.includes(selectedFormat)) {
      throw createScribdError(
        `Formato no soportado. Opciones: ${SUPPORTED_FORMATS.join(', ')}`,
        400
      );
    }

    const context = await loadDocumentContext(normalized.documentId, transport);

    if (!context.downloadable) {
      throw createScribdError(
        'El autor no permite descargar este documento desde Scribd.',
        403
      );
    }

    if (context.pages.length > MAX_PAGES) {
      throw createScribdError(
        `El documento tiene ${context.pages.length} páginas y el máximo permitido es ${MAX_PAGES}.`,
        422
      );
    }

    const { images, warnings, blocked } = await materializePages(context.pages, transport, {
      obfuscated: context.obfuscated,
      title: context.title
    });

    if (!images.length) {
      if (blocked) {
        throw createScribdError(
          'Scribd sirve este documento como texto protegido y sin imágenes de página, así que no es posible reconstruirlo. Puedes leerlo en Scribd.',
          422
        );
      }

      throw createScribdError(
        'No se pudo recuperar ninguna página del documento desde Scribd.',
        502
      );
    }

    const { jobId, jobDir } = buildJobDir();

    try {
      const result = await buildPresentationFileFromImages(
        images,
        selectedFormat,
        jobDir,
        context.title,
        'sd'
      );

      if (blocked) {
        warnings.push(
          `${blocked} página(s) no se pudieron incluir porque usan texto protegido por Scribd.`
        );
      }

      return {
        jobId,
        title: context.title,
        format: selectedFormat,
        pageCount: images.length,
        totalPages: context.pages.length,
        fileName: result.filename,
        filePath: result.outputFile,
        // Se conserva por compatibilidad con clientes antiguos; la API ya
        // envía el archivo en la misma respuesta y borra el trabajo.
        downloadUrl: `/download/${jobId}/${result.filename}`,
        warnings,
        sourceUrl: context.canonicalUrl
      };
    } catch (error) {
      fs.rmSync(jobDir, { recursive: true, force: true });
      throw error;
    }
  }

  return { inspect, download };
}

const defaultService = createScribdService();

module.exports = {
  MAX_PAGES,
  SUPPORTED_FORMATS,
  createScribdService,
  createNodeTransport,
  decodeContentEncoding,
  normalizeScribdUrl,
  extractEmbedConfig,
  extractPageManifest,
  parseJsonpMarkup,
  parseTextLayer,
  parseImageLayer,
  renderPageToPng,
  looksObfuscated,
  cleanScribdTitle,
  inspect: defaultService.inspect,
  download: defaultService.download
};
