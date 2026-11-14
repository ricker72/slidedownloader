(function exposeSearchUtils(root, factory) {
  const utils = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = utils;
  } else {
    root.SlideDownloaderSearchUtils = utils;
  }
})(typeof globalThis === 'undefined' ? this : globalThis, function createSearchUtils() {
  const SUPPORTED_FORMATS = ['pptx', 'ppt', 'pdf'];
  const DEFAULT_FORMATS = [...SUPPORTED_FORMATS];
  const RESULT_LIMIT = 10;
  const GENERIC_TITLES = /^(?:pptx?|pdf|documento pdf|presentaci[oó]n de powerpoint|powerpoint presentation|presentaci[oó]n|microsoft powerpoint(?: -.*)?)$/i;

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
    const typeFilters = normalizeFormats(formats).map((format) => `filetype:${format}`);
    return `${normalizeTopic(topic)} ${typeFilters.join(' OR ')}`.trim();
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

  function toDirectResult(raw, fallbackFormat) {
    if (!raw || typeof raw !== 'object') return null;

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

  function parseGoogleSearchItems(items, formats = DEFAULT_FORMATS) {
    const selectedFormats = new Set(normalizeFormats(formats));
    const results = (Array.isArray(items) ? items : [])
      .map((item) => item && toDirectResult({
        title: item.titleNoFormatting || item.title,
        url: item.url || item.link,
        snippet: item.contentNoFormatting || item.content || item.snippet,
      }))
      .filter((item) => item && selectedFormats.has(item.format));

    return mergeRoundRobin([results]);
  }

  return {
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
    parseGoogleSearchItems,
    mergeRoundRobin,
  };
});
