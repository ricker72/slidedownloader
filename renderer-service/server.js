/**
 * Servidor de renderizado externo para SlideDownloader.
 * Usa Puppeteer (Chromium real) para abrir presentaciones de SlideShare
 * y extraer título, descripción, autor y URLs de las imágenes de cada diapositiva.
 * Incluye scroll automático para cargar todas las imágenes (lazy-loading).
 *
 * NO desplegar en Vercel serverless.
 * Desplegar en: Railway, Render, fly.io, o cualquier VPS con Node.js.
 */

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '10mb' }));

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
        '--single-process',
        '--disable-gpu'
      ]
    });
  }
  return browser;
}

/**
 * Hacer scroll por la página para cargar todas las imágenes (lazy-loading)
 * SlideShare carga las imágenes solo cuando se hace scroll hacia ellas.
 */
async function scrollAndLoadImages(page) {
  console.log('Iniciando scroll para cargar imágenes...');

  const maxScrolls = 60; // Máximo de scrolls para evitar bucle infinito
  const scrollDelay = 1500; // Espera entre scrolls (ms)
  const scrollStep = 800; // Píxeles por scroll

  let previousHeight = 0;
  let currentHeight = await page.evaluate('document.body.scrollHeight');

  for (let i = 0; i < maxScrolls; i++) {
    // Hacer scroll hacia abajo
    await page.evaluate((scrollStep) => {
      window.scrollBy(0, scrollStep);
    }, scrollStep);

    // Esperar a que carguen las imágenes
    await new Promise(resolve => setTimeout(resolve, scrollDelay));

    // Verificar si la página creció (cargó más contenido)
    const newHeight = await page.evaluate('document.body.scrollHeight');
    if (newHeight === previousHeight && newHeight === currentHeight) {
      // Si no creció, intentar un scroll final al fondo
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise(resolve => setTimeout(resolve, scrollDelay));
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

  // Scroll final al inicio para asegurar que todo cargó
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('Scroll completado');
}

/**
 * Extraer información y imágenes de la página cargada
 */
async function extractPageData(page) {
  return await page.evaluate(() => {
    const addValue = (set, raw) => {
      if (typeof raw !== 'string') return;
      const value = raw.trim();
      if (!value) return;
      if (value.startsWith('data:image')) return;
      if (/(jpg|jpeg|png|gif|webp|bmp)/i.test(value)) set.add(value);
    };

    const imageSet = new Set();

    // Imágenes de <img> y <source>
    for (const img of document.querySelectorAll('img, source')) {
      addValue(imageSet, img.currentSrc || img.src || img.dataset.src || img.dataset.original || img.getAttribute('data-full'));
      addValue(imageSet, img.getAttribute('srcset')?.split(',')[0]?.trim().split(/\s+/)[0]);
    }

    // URLs de imágenes en scripts
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

app.post('/render', async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'URL requerida' });
  }

  let page = null;

  try {
    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();

    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
      'Upgrade-Insecure-Requests': '1'
    });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // Espera inicial para que cargue el contenido base
    await new Promise((r) => setTimeout(r, 3000));

    // Hacer scroll para cargar todas las imágenes (lazy-loading)
    await scrollAndLoadImages(page);

    // Extraer datos
    const result = await extractPageData(page);

    // Deduplicar y filtrar
    const deduped = [...new Set(result.imageUrls.filter(Boolean))];
    const imageUrls = deduped.filter((u) => /(jpg|jpeg|png|gif|webp|bmp)/i.test(u)).slice(0, 200);

    // Detectar challenge de SlideShare
    const challengeDetected =
      /verify you are human|check your browser|captcha|bot detected|access denied|security check|challenge/i.test(
        (await page.evaluate(() => document.body.innerText)) || ''
      ) ||
      (await page.evaluate(() => !!document.querySelector('iframe[src*="captcha"], #challenge-stage, .recaptcha')));

    return res.json({
      success: true,
      url,
      title: result.title || 'Presentación',
      description: result.description || '',
      author: result.author || '',
      slideCount: imageUrls.length,
      imageUrls,
      previewImages: imageUrls,
      galleryImages: imageUrls,
      challengeDetected: challengeDetected || false,
      method: 'puppeteer'
    });
  } catch (error) {
    console.error('Error en /render:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error al renderizar la presentación'
    });
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {
        // ignore
      }
    }
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'slidedownloader-renderer' });
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
