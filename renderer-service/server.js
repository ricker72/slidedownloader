/**
 * Servidor de renderizado externo para SlideDownloader.
 *
 * Este servicio usa Puppeteer (Chromium real) para abrir presentaciones de
 * SlideShare y extraer:
 *   - Título, descripción y autor
 *   - URLs de las imágenes de cada diapositiva (calidad original)
 *
 * NO desplegar en Vercel serverless (Chromium no funciona allí).
 * Desplegar en: Railway, Render, fly.io, o cualquier VPS con Node.js.
 *
 * Variables de entorno:
 *   PORT - Puerto donde escuchar (default: 3001)
 *   CORS_ORIGIN - Origen permitido para CORS (default: *)
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

    // Esperar a que cargue el DOM, no necesitamos JS completo
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // Pequeña pausa para que carguen las imágenes del primer render
    await new Promise((r) => setTimeout(r, 2000));

    const result = await page.evaluate(() => {
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

    // Deduplicar y filtrar
    const deduped = [...new Set(result.imageUrls.filter(Boolean))];
    const imageUrls = deduped.filter((u) => /(jpg|jpeg|png|gif|webp|bmp)/i.test(u)).slice(0, 60);

    // Detectar challenge de SlideShare
    const challengeDetected =
      /verify you are human|check your browser|captcha|bot detected|access denied|security check|challenge/i.test(
        (document.body && document.body.innerText) || ''
      ) ||
      !!document.querySelector('iframe[src*="captcha"], #challenge-stage, .recaptcha');

    return res.json({
      success: true,
      url,
      title: result.title || 'Presentación',
      description: result.description || '',
      author: result.author || '',
      slideCount: imageUrls.length,
      previewImages: imageUrls.slice(0, 8),
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
