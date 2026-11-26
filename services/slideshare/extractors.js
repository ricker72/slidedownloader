let chromium;
try {
  chromium = require('playwright').chromium;
} catch (error) {
  chromium = null;
}
const { DEFAULT_TITLE, MAX_SLIDES, USER_AGENTS, getRuntime } = require('../../config');
const { dedupeUrls, isLikelyImageUrl } = require('./slideUtils');

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
  const { rendererUrl, rendererSecret } = getRuntime();

  if (!rendererUrl) {
    throw new Error('RENDERER_URL no configurada. No se puede usar el renderizador externo.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const headers = { 'Content-Type': 'application/json' };

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

module.exports = {
  extractPresentationInfo,
  extractPresentationInfoLite,
  extractPresentationInfoViaRenderer
};
