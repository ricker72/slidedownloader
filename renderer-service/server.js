/**
 * Servidor de renderizado externo para SlideDownloader.
 * Usa Puppeteer (Chromium real) para abrir presentaciones de SlideShare
 * y extraer título, descripción, autor y URLs de las imágenes de cada diapositiva.
 * Incluye scroll automático para cargar todas las imágenes (lazy-loading).
 *
 * Seguridad:
 * - Solo acepta URLs públicas de slideshare.net.
 * - Exige `RENDERER_SECRET` (cabecera `Authorization: Bearer ...`).
 * - Limita cuántos renders se ejecutan a la vez y cuánto pueden tardar.
 * - Bloquea peticiones del navegador hacia IPs privadas o locales.
 *
 * NO desplegar en Vercel serverless.
 * Desplegar en: Railway, Render, fly.io, o cualquier VPS con Node.js.
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const puppeteer = require('puppeteer');
const { normalizeSlideshareUrl, isBlockedHost } = require('./guards');

const app = express();
const PORT = process.env.PORT || 3001;

const CORS_ORIGIN = String(process.env.CORS_ORIGIN || '').trim();
const RENDERER_SECRET = String(process.env.RENDERER_SECRET || '').trim();
const MAX_CONCURRENT_RENDERS = Math.max(1, Number(process.env.MAX_CONCURRENT_RENDERS) || 2);
const MAX_QUEUED_RENDERS = Math.max(0, Number(process.env.MAX_QUEUED_RENDERS) || 10);
const QUEUE_TIMEOUT_MS = Math.max(1000, Number(process.env.QUEUE_TIMEOUT_MS) || 30000);
const RENDER_TIMEOUT_MS = Math.max(10000, Number(process.env.RENDER_TIMEOUT_MS) || 120000);

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

if (CORS_ORIGIN) {
  const allowedOrigins = CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean);
  app.use(cors({ origin: allowedOrigins.includes('*') ? '*' : allowedOrigins }));
}

if (!RENDERER_SECRET) {
  console.error('[renderer] RENDERER_SECRET no está configurado: /render responderá 503.');
}

let browser = null;

async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
  }
  return browser;
}

/* ------------------------------------------------------------------ *
 * Control de concurrencia
 * ------------------------------------------------------------------ */

let activeRenders = 0;
const waitingRenders = [];

function acquireSlot() {
  if (activeRenders < MAX_CONCURRENT_RENDERS) {
    activeRenders += 1;
    return Promise.resolve();
  }

  if (waitingRenders.length >= MAX_QUEUED_RENDERS) {
    return Promise.reject(Object.assign(new Error('Renderizador ocupado'), { status: 429 }));
  }

  return new Promise((resolve, reject) => {
    const entry = { resolve, reject, timer: null };

    entry.timer = setTimeout(() => {
      const index = waitingRenders.indexOf(entry);
      if (index !== -1) waitingRenders.splice(index, 1);
      reject(Object.assign(new Error('Tiempo de espera en cola agotado'), { status: 504 }));
    }, QUEUE_TIMEOUT_MS);

    waitingRenders.push(entry);
  });
}

function releaseSlot() {
  const next = waitingRenders.shift();

  if (next) {
    clearTimeout(next.timer);
    next.resolve();
    return;
  }

  activeRenders = Math.max(0, activeRenders - 1);
}

function withTimeout(promise, timeoutMs) {
  let timer;

  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error('Tiempo de espera agotado'), { status: 504 })),
      timeoutMs
    );
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/* ------------------------------------------------------------------ *
 * Autenticación
 * ------------------------------------------------------------------ */

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireSecret(req, res, next) {
  if (!RENDERER_SECRET) {
    return res.status(503).json({
      success: false,
      error: 'El renderizador no tiene RENDERER_SECRET configurado.'
    });
  }

  const authorization = req.get('authorization') || '';
  const bearer = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
  const alternative = req.get('x-renderer-secret') || '';

  if (!safeEqual(bearer, RENDERER_SECRET) && !safeEqual(alternative, RENDERER_SECRET)) {
    return res.status(401).json({ success: false, error: 'No autorizado' });
  }

  return next();
}

/* ------------------------------------------------------------------ *
 * Extracción de la presentación
 * ------------------------------------------------------------------ */

/**
 * Hacer scroll por la página para cargar todas las imágenes (lazy-loading).
 * SlideShare carga las imágenes solo cuando se hace scroll hacia ellas.
 */
async function scrollAndLoadImages(page) {
  console.log('Iniciando scroll para cargar imágenes...');

  const maxScrolls = 60;
  const scrollDelay = 1500;
  const scrollStep = 800;

  let previousHeight = 0;
  let currentHeight = await page.evaluate('document.body.scrollHeight');

  for (let i = 0; i < maxScrolls; i++) {
    await page.evaluate((step) => {
      window.scrollBy(0, step);
    }, scrollStep);

    await new Promise((resolve) => setTimeout(resolve, scrollDelay));

    const newHeight = await page.evaluate('document.body.scrollHeight');
    if (newHeight === previousHeight && newHeight === currentHeight) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise((resolve) => setTimeout(resolve, scrollDelay));
      const finalHeight = await page.evaluate('document.body.scrollHeight');
      if (finalHeight === currentHeight) {
        console.log(`No hay más contenido después de ${i + 1} scrolls`);
        break;
      }
    }

    previousHeight = currentHeight;
    currentHeight = newHeight;
    console.log(`Scroll ${i + 1}: altura ${currentHeight}px`);
  }

  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log('Scroll completado');
}

async function extractPageData(page) {
  return page.evaluate(() => {
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

    const scriptText = Array.from(document.querySelectorAll('script'))
      .map((node) => node.textContent || '')
      .join(' ');
    const matches = scriptText.match(/https?:\/\/[^\s"'<>]+(?:\.(?:jpg|jpeg|png|webp|gif|bmp))(?:\?[^\s"'<>]*)?/gi) || [];
    for (const match of matches) {
      addValue(imageSet, match);
    }

    const title =
      document.title ||
      document.querySelector('meta[property="og:title"]')?.content ||
      document.querySelector('meta[name="twitter:title"]')?.content ||
      'Presentación';

    const readMeta = (selector) =>
      document.querySelector(selector)?.getAttribute('content')?.trim() || '';

    return {
      title,
      description: readMeta('meta[name="description"]') || readMeta('meta[property="og:description"]') || '',
      author: readMeta('meta[name="author"]') || readMeta('meta[property="article:author"]') || '',
      imageUrls: [...imageSet]
    };
  });
}

async function renderPresentation(url) {
  const browserInstance = await getBrowser();
  const page = await browserInstance.newPage();

  try {
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
      'Upgrade-Insecure-Requests': '1'
    });

    // Bloquear peticiones del navegador hacia la red interna o esquemas locales.
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      try {
        const parsed = new URL(request.url());

        if (parsed.protocol === 'file:' || parsed.protocol === 'ftp:') {
          return request.abort();
        }

        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return request.continue();
        }

        if (isBlockedHost(parsed.hostname)) {
          return request.abort();
        }

        return request.continue();
      } catch (error) {
        try {
          return request.abort();
        } catch (abortError) {
          return undefined;
        }
      }
    });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));
    await scrollAndLoadImages(page);

    const result = await extractPageData(page);

    const deduped = [...new Set(result.imageUrls.filter(Boolean))];
    const imageUrls = deduped.filter((value) => /(jpg|jpeg|png|gif|webp|bmp)/i.test(value)).slice(0, 200);

    const challengeDetected =
      /verify you are human|check your browser|captcha|bot detected|access denied|security check|challenge/i.test(
        (await page.evaluate(() => document.body.innerText)) || ''
      ) ||
      (await page.evaluate(() => !!document.querySelector('iframe[src*="captcha"], #challenge-stage, .recaptcha')));

    return {
      url,
      title: result.title || 'Presentación',
      description: result.description || '',
      author: result.author || '',
      slideCount: imageUrls.length,
      imageUrls,
      previewImages: imageUrls,
      galleryImages: imageUrls,
      challengeDetected: challengeDetected || false
    };
  } finally {
    await page.close().catch(() => {});
  }
}

/* ------------------------------------------------------------------ *
 * Endpoints
 * ------------------------------------------------------------------ */

app.post('/render', requireSecret, async (req, res) => {
  const url = normalizeSlideshareUrl(req.body && req.body.url);

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'Solo se aceptan URLs públicas de slideshare.net'
    });
  }

  let acquired = false;
  let work = null;

  try {
    await acquireSlot();
    acquired = true;

    work = renderPresentation(url);
    const result = await withTimeout(work, RENDER_TIMEOUT_MS);

    return res.json({ success: true, ...result, method: 'puppeteer' });
  } catch (error) {
    const status = Number(error.status) || 500;

    if (status >= 500) {
      console.error('Error en /render:', error.message);
    }

    const message =
      status === 429
        ? 'El renderizador está ocupado. Intenta de nuevo en unos segundos.'
        : status === 504
          ? 'El renderizado tardó demasiado.'
          : status >= 500
            ? 'No se pudo renderizar la presentación.'
            : error.message;

    return res.status(status).json({ success: false, error: message });
  } finally {
    // El cupo se libera cuando la página termina de cerrarse, no cuando
    // responde el timeout, para no superar el máximo de navegadores.
    if (acquired) {
      if (work) {
        work.finally(() => releaseSlot()).catch(() => {});
      } else {
        releaseSlot();
      }
    }
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'slidedownloader-renderer',
    active: activeRenders,
    queued: waitingRenders.length
  });
});

app.listen(PORT, () => {
  console.log(`🖥️  Renderizador de SlideShare corriendo en http://0.0.0.0:${PORT}`);
});

process.on('SIGTERM', async () => {
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});
