/**
 * Búsqueda de presentaciones y documentos con filtros `filetype:`.
 *
 * La búsqueda combina filtros `filetype:`; Bing se consulta primero y
 * DuckDuckGo HTML/lite queda como respaldo. Solo se conservan enlaces
 * directos a archivos .ppt, .pptx o .pdf.
 */

const SUPPORTED_FORMATS = ['pptx', 'ppt', 'pdf'];
const DEFAULT_FORMATS = [...SUPPORTED_FORMATS];
const RESULT_LIMIT = 18;
const REQUEST_TIMEOUT = 7000;
const CACHE_TTL = 10 * 60 * 1000;
const CACHE_LIMIT = 100;

const EXCLUDED_DOMAINS = [
  'studocu.com',
  'scribd.com',
  'coursehero.com',
  'docsity.com',
  'brainly.com',
  'brainly.lat',
  'prezi.com',
];

const GENERIC_TITLES = /^(?:pptx?|pdf|documento pdf|presentaci[oó]n de powerpoint|powerpoint presentation|presentaci[oó]n|microsoft powerpoint(?: -.*)?)$/i;

const cache = new Map();

const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'es-MX,es;q=0.9,en;q=0.7',
};

function decodeEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'");
}

function stripTags(value) {
  return decodeEntities(String(value || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeUrlPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeTopic(value) {
  return String(value || '')
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function normalizeFormats(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || '').split(',');

  const formats = list
    .map((item) => String(item || '').trim().toLowerCase().replace(/^\./, ''))
    .filter((item) => SUPPORTED_FORMATS.includes(item));

  return formats.length ? [...new Set(formats)] : [...DEFAULT_FORMATS];
}

function buildSearchQuery(topic, formats = DEFAULT_FORMATS) {
  const selectedFormats = normalizeFormats(formats);
  const typeFilters = selectedFormats.map((format) => `filetype:${format}`);
  const typeQuery = typeFilters.length === 1
    ? typeFilters[0]
    : `(${typeFilters.join(' OR ')})`;

  return `${normalizeTopic(topic)} ${typeQuery}`.trim();
}

function buildGoogleUrl(topic, formats = DEFAULT_FORMATS) {
  return `https://www.google.com/search?q=${encodeURIComponent(buildSearchQuery(topic, formats))}&hl=es`;
}

function getFormatFromUrl(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.toLowerCase().match(/\.(pptx?|pdf)$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function isExcludedDomain(hostname) {
  const host = String(hostname || '').toLowerCase();
  return EXCLUDED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function decodeDuckDuckGoUrl(href, base = 'https://duckduckgo.com') {
  const decoded = decodeEntities(href);

  try {
    const url = new URL(decoded, base);
    const target = url.searchParams.get('uddg');
    if (target) return decodeEntities(target);
    return url.href;
  } catch {
    return decoded;
  }
}

function cleanFileTitle(value, url) {
  let title = stripTags(value)
    .replace(/^(?:pptx?|pdf)\s*[-–:|·]?\s+/i, '')
    .replace(/^microsoft powerpoint\s*[-–:]\s*/i, '')
    .replace(/\s*[-–|]\s*ppt(x)?\s*$/i, '')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();

  let fileName = '';

  try {
    const parsed = new URL(url);
    fileName = decodeURIComponent(parsed.pathname.split('/').pop() || '');
  } catch {
    fileName = '';
  }

  const baseName = fileName.replace(/\.(pptx?|pdf)$/i, '').replace(/[+_]+/g, ' ').trim();

  if (!title || GENERIC_TITLES.test(title)) {
    if (baseName && !/^[\d\s.-]+$/.test(baseName)) {
      title = baseName.replace(/\s+/g, ' ');
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }
  }

  if (!title || GENERIC_TITLES.test(title)) {
    try {
      title = `Presentación de ${new URL(url).hostname.replace(/^www\./, '')}`;
    } catch {
      title = 'Presentación para descargar';
    }
  }

  return title.slice(0, 160);
}

function cleanSnippet(value) {
  return stripTags(value)
    .replace(/^(?:\.\.\.|…)\s*/, '')
    .replace(/\s*(?:\.\.\.|…)$/, '')
    .replace(/\s+([.,;:!?])/g, '$1')
    .slice(0, 320);
}

/**
 * Convierte una coincidencia cruda en un resultado mostrable, o null si no
 * apunta directamente a un archivo compatible.
 */
function toDirectResult(raw, fallbackFormat) {
  const url = String(raw.url || '').trim();

  if (!/^https?:\/\//i.test(url)) return null;

  const format = getFormatFromUrl(url);
  if (!format || (fallbackFormat && format !== fallbackFormat)) return null;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (isExcludedDomain(parsed.hostname)) return null;

  const host = parsed.hostname.replace(/^www\./, '');
  const fileName = decodeUrlPart(parsed.pathname.split('/').pop() || '');
  const displayPath = decodeUrlPart(parsed.pathname);

  return {
    title: cleanFileTitle(raw.title, url),
    url,
    domain: host,
    path: displayPath.length > 86 ? `${displayPath.slice(0, 83)}…` : displayPath,
    fileName: fileName || `presentacion.${format}`,
    snippet: cleanSnippet(raw.snippet),
    format,
  };
}

function parseDuckDuckGoHtml(html) {
  const blocks = String(html || '')
    .split(/(?=<div[^>]*class="[^"]*result\s+results_links[^"]*")/i)
    .slice(1);
  const results = [];

  for (const raw of blocks) {
    const block = raw.split(/<div[^>]*class="[^"]*nav-link/i)[0];

    if (/result--ad|result--advertisement/i.test(block)) continue;

    const anchor = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;

    const snippet = block.match(/<[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/i);
    const display = block.match(/<[^>]*class="[^"]*result__url[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/i);

    results.push({
      title: stripTags(anchor[2]),
      url: decodeDuckDuckGoUrl(anchor[1]),
      snippet: snippet ? cleanSnippet(snippet[1]) : '',
      display: display ? stripTags(display[1]) : '',
    });
  }

  return results;
}

function parseDuckDuckGoLite(html) {
  const source = String(html || '');
  const results = [];
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(source))) {
    const attributes = match[1];

    if (!/class=['"][^'"]*result-link/i.test(attributes)) continue;

    const href = (attributes.match(/href="([^"]+)"/i) || attributes.match(/href='([^']+)'/i) || [])[1];

    if (!href || /duckduckgo\.com\/duckduckgo-help-pages/i.test(href)) continue;

    const tail = source.slice(match.index + match[0].length, match.index + match[0].length + 2400);

    // Los anuncios de la versión lite llevan la etiqueta "Sponsored link".
    if (/^\s*\(?\s*Sponsored link/i.test(tail)) continue;

    const snippet = tail.match(/<(?:td|div|span)[^>]*class=['"][^'"]*result-snippet[^'"]*['"][^>]*>([\s\S]*?)<\/(?:td|div|span)>/i);

    results.push({
      title: stripTags(match[2]),
      url: decodeDuckDuckGoUrl(href),
      snippet: snippet ? cleanSnippet(snippet[1]) : '',
      display: '',
    });
  }

  return results;
}

async function fetchSearchPage(url, { detectDuckDuckGoChallenge = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`El buscador respondió ${response.status}`);
    }

    const html = await response.text();

    // Una página de desafío/anomalía no contiene resultados utilizables.
    if (detectDuckDuckGoChallenge && /anomaly-modal|challenge-form|captcha/i.test(html) && !/result__a|result-link/i.test(html)) {
      throw new Error('DuckDuckGo pidió una verificación');
    }

    return html;
  } finally {
    clearTimeout(timer);
  }
}

function decodeBingUrl(href, base = 'https://www.bing.com') {
  const decoded = decodeEntities(href);

  try {
    const url = new URL(decoded, base);
    if (!/(^|\.)bing\.com$/i.test(url.hostname)) return url.href;

    const target = url.searchParams.get('u');
    if (target?.startsWith('a1')) {
      const targetUrl = Buffer.from(target.slice(2), 'base64url').toString('utf8');
      try {
        return new URL(targetUrl).href;
      } catch {
        return decoded;
      }
    }

    return url.href;
  } catch {
    return decoded;
  }
}

function parseBingHtml(html) {
  const blocks = String(html || '')
    .split(/(?=<li\b[^>]*class=["'][^"']*\bb_algo\b[^"']*["'])/i)
    .slice(1);
  const results = [];

  for (const block of blocks) {
    const anchor = block.match(/<h2\b[^>]*>\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;

    const snippet = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    results.push({
      title: stripTags(anchor[2]),
      url: decodeBingUrl(anchor[1]),
      snippet: snippet ? cleanSnippet(snippet[1]) : '',
      display: '',
    });
  }

  return results;
}

/**
 * Consulta los formatos solicitados con la versión HTML y reintenta con lite.
 */
async function searchQuery(topic, formats) {
  const selectedFormats = new Set(normalizeFormats(formats));
  const query = buildSearchQuery(topic, [...selectedFormats]);
  const endpoints = [
    `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
  ];

  const errors = [];

  for (const endpoint of endpoints) {
    try {
      const html = await fetchSearchPage(endpoint, {
        detectDuckDuckGoChallenge: endpoint.includes('duckduckgo.com'),
      });
      const parsed = endpoint.includes('lite.duckduckgo.com')
        ? parseDuckDuckGoLite(html)
        : endpoint.includes('bing.com')
          ? parseBingHtml(html)
          : parseDuckDuckGoHtml(html);

      const direct = parsed
        .map((item) => toDirectResult(item))
        .filter((item) => item && selectedFormats.has(item.format));

      if (direct.length) return mergeRoundRobin([direct]);
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (errors.length === endpoints.length) {
    throw new Error(errors[0] || 'No se pudo consultar el buscador');
  }

  return [];
}

function mergeRoundRobin(groups, limit = RESULT_LIMIT) {
  const merged = [];
  const seen = new Set();
  const queues = groups.map((group) => [...group]);
  let index = 0;

  while (merged.length < limit && queues.some((queue) => queue.length)) {
    const queue = queues[index % queues.length];
    index += 1;

    if (!queue.length) continue;

    const item = queue.shift();
    if (seen.has(item.url)) continue;

    seen.add(item.url);
    merged.push(item);
  }

  return merged;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function setCached(key, value) {
  if (cache.size >= CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }

  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
}

async function searchPresentations({ topic, formats } = {}) {
  const cleanTopic = normalizeTopic(topic);
  const selectedFormats = normalizeFormats(formats);

  if (cleanTopic.length < 2) {
    const error = new Error('Escribe un tema de al menos 2 caracteres');
    error.status = 400;
    throw error;
  }

  const cacheKey = `${cleanTopic.toLowerCase()}|${selectedFormats.join(',')}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  let combinedResults = [];
  let combinedError = null;
  try {
    combinedResults = await searchQuery(cleanTopic, selectedFormats);
  } catch (error) {
    combinedError = error;
  }

  const foundFormats = new Set(combinedResults.map((item) => item.format));
  const missingFormats = selectedFormats.filter((format) => !foundFormats.has(format));
  const settled = await Promise.allSettled(
    missingFormats.map((format) => searchQuery(cleanTopic, [format]))
  );

  const groups = combinedResults.length ? [combinedResults] : [];
  const failures = [];

  settled.forEach((entry, index) => {
    if (entry.status === 'fulfilled') {
      groups.push(entry.value);
    } else {
      failures.push({ format: missingFormats[index], message: entry.reason?.message || 'Error' });
    }
  });

  if (!groups.length && failures.length === missingFormats.length && combinedError) {
    failures.unshift({
      format: selectedFormats.join(','),
      message: combinedError.message || 'Error'
    });
  }

  if (!groups.length && failures.length) {
    const error = new Error('El buscador no respondió. Intenta de nuevo o abre la búsqueda en Google.');
    error.status = 502;
    error.failures = failures;
    throw error;
  }

  const results = mergeRoundRobin(groups);

  const payload = {
    topic: cleanTopic,
    formats: selectedFormats,
    count: results.length,
    results,
    googleUrl: buildGoogleUrl(cleanTopic, selectedFormats),
    partial: failures.length > 0,
    cached: false,
  };

  if (results.length) {
    setCached(cacheKey, payload);
  }

  return payload;
}

module.exports = {
  SUPPORTED_FORMATS,
  DEFAULT_FORMATS,
  RESULT_LIMIT,
  normalizeTopic,
  normalizeFormats,
  buildSearchQuery,
  buildGoogleUrl,
  getFormatFromUrl,
  cleanFileTitle,
  toDirectResult,
  parseDuckDuckGoHtml,
  parseDuckDuckGoLite,
  parseBingHtml,
  mergeRoundRobin,
  searchPresentations,
};
