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
const PDFDocument = require('pdfkit');
const PptxGenJS = require('pptxgenjs');
const { Document, Packer, Paragraph, HeadingLevel, TextRun, ImageRun } = require('docx');
const { v4: uuidv4 } = require('uuid');

const ROOT_DIR = path.join(__dirname, '..');
const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DOWNLOADS_DIR = isVercel
  ? path.join('/tmp', 'slidedownloader-downloads')
  : path.join(ROOT_DIR, 'downloads');
const DEFAULT_TITLE = 'presentacion';
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
];

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

// Tope de diapositivas por presentación. Evita respuestas gigantes y abusos.
const MAX_SLIDES = 200;

/**
 * Las páginas de SlideShare incluyen, además de las diapositivas, miniaturas
 * de presentaciones relacionadas, avatares y logos. Si se descargan tal cual,
 * el archivo final mezcla diapositivas reales con imágenes ajenas.
 *
 * Este selector agrupa las URLs por carpeta del CDN (`.../<deck>/<version>/`)
 * y se queda con la carpeta que contiene más diapositivas: la presentación
 * actual. Después elimina duplicados por número de diapositiva y las ordena.
 */
function selectSlideImages(list) {
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
      return ordered.slice(0, MAX_SLIDES);
    }
  }

  // Sin patrón reconocible: descartar imágenes que claramente no son diapositivas.
  const filtered = urls.filter(
    (url) => !/avatar|profile|user[-_]?photo|logo|icon|sprite|placeholder|default[-_]/i.test(url)
  );

  return (filtered.length ? filtered : urls).slice(0, MAX_SLIDES);
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

const QUALITY_LEVELS = ['sd', 'hd'];
// SlideShare publica variantes de 1024 y 2048 px para la mayoría de slides.
const HD_WIDTH = 2048;
const HD_FALLBACK_WIDTH = 1024;

// Formatos que la API puede generar de verdad.
const SUPPORTED_FORMATS = ['pdf', 'pptx', 'ppsx', 'potx', 'docx'];

// PPSX y POTX son el mismo paquete OOXML que PPTX con otro tipo de contenido.
const PPTX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml';
const PPTX_VARIANTS = {
  ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml',
  potx: 'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml'
};

function rewriteImageWidth(imageUrl, width) {
  if (!imageUrl) return imageUrl;

  return imageUrl.replace(/-(\d{2,4})\.(jpe?g|png|webp)(\?[^#]*)?$/i, (match, currentWidth, extension, query) => {
    const numericWidth = Number(currentWidth);

    if (!Number.isFinite(numericWidth) || numericWidth >= width) {
      return match;
    }

    return `-${width}.${extension}${query || ''}`;
  });
}

/**
 * Reescribir la URL del CDN de SlideShare a una resolución mayor.
 * Solo actúa sobre sufijos de ancho conocidos (`...-1-320.jpg`) y deja
 * intactas las URLs que ya son grandes o que no siguen ese patrón.
 */
function applyImageQuality(imageUrl, quality) {
  if (!imageUrl || String(quality).toLowerCase() !== 'hd') {
    return imageUrl;
  }

  return rewriteImageWidth(imageUrl, HD_WIDTH);
}

/**
 * Variantes a probar en orden. Si el CDN no publica la resolución máxima,
 * se intenta 1024 px y por último la URL original para no perder la slide.
 */
function getImageCandidates(imageUrl, quality = 'sd') {
  if (!imageUrl || String(quality).toLowerCase() !== 'hd') {
    return [imageUrl];
  }

  return [...new Set([
    rewriteImageWidth(imageUrl, HD_WIDTH),
    rewriteImageWidth(imageUrl, HD_FALLBACK_WIDTH),
    imageUrl
  ])];
}

/**
 * Descargar una imagen en la calidad pedida, probando las variantes
 * disponibles antes de rendirse.
 */
async function downloadImage(imageUrl, quality = 'sd') {
  const candidates = getImageCandidates(imageUrl, quality);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      return await downloadBinary(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`No se pudo descargar la imagen: ${imageUrl}`);
}

async function downloadBinary(url, redirectCount = 0) {
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
        return resolve(downloadBinary(response.headers.location, redirectCount + 1));
      }

      if (status >= 400) {
        return reject(new Error(`HTTP ${status} al descargar recurso`));
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });

    request.setTimeout(30000, () => {
      request.destroy(new Error('Timeout al descargar recurso'));
    });
    request.on('error', reject);
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
    const response = await fetch(`${rendererUrl.replace(/\/$/, '')}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
 * Descarga las imágenes en paralelo (con límite) conservando el orden original.
 * En Vercel, descargar decenas de diapositivas en serie puede agotar el tiempo
 * máximo de ejecución de la función.
 */
async function downloadImagesConcurrently(imageUrls, quality, concurrency = 6) {
  const list = Array.isArray(imageUrls) ? imageUrls : [];
  const results = new Array(list.length).fill(null);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, list.length) }, async () => {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;

      try {
        const buffer = await downloadImage(list[index], quality);
        results[index] = { url: list[index], buffer, mime: detectImageMime(buffer) };
      } catch (error) {
        console.warn(`No se pudo descargar la imagen ${list[index]}:`, error.message);
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
  for (const { url, buffer, mime } of downloaded) {
    if (mime !== 'image/png' && mime !== 'image/jpeg') {
      console.warn(`Imagen omitida en PPTX (${mime || 'formato desconocido'}): ${url}`);
      continue;
    }

    validImages.push({ url, buffer, mime });
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

  for (const { buffer, mime } of validImages) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addText(title || DEFAULT_TITLE, { x: 0.5, y: 0.2, w: 12, h: 0.5, fontSize: 18, bold: true, color: '111827' });
    slide.addImage({ data: toDataUri(buffer, mime), x: 0.5, y: 0.8, w: 12.8, h: 6.8 });
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
  for (const { url, buffer, mime } of downloaded) {
    if (mime !== 'image/png' && mime !== 'image/jpeg') {
      console.warn(`Imagen omitida en DOCX (${mime || 'formato desconocido'}): ${url}`);
      continue;
    }

    validImages.push({ url, buffer, mime });
  }

  for (let index = 0; index < validImages.length; index += 1) {
    const item = validImages[index];
    children.push(new Paragraph({ text: `Slide ${index + 1}`, heading: HeadingLevel.HEADING_2, spacing: { before: 120, after: 120 } }));
    children.push(new Paragraph({
      children: [
        new ImageRun({
          data: item.buffer,
          transformation: { width: 500, height: 300 }
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
    throw createServiceError(`Formato no soportado: ${format}`, 400);
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

function createServiceError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function downloadPresentation(url, format = 'pdf', quality = 'sd') {
  const normalizedUrl = normalizeSlideShareUrl(url);
  if (!normalizedUrl) {
    throw createServiceError('URL inválida. Debe ser una URL válida de SlideShare.', 400);
  }

  const extension = String(format || 'pdf').toLowerCase();
  if (!SUPPORTED_FORMATS.includes(extension)) {
    throw createServiceError(`Formato no soportado: ${format}`, 400);
  }

  const selectedQuality = String(quality || 'sd').toLowerCase();
  if (!QUALITY_LEVELS.includes(selectedQuality)) {
    throw createServiceError(`Calidad no soportada: ${quality}`, 400);
  }

  const { jobId, jobDir } = buildJobDir();

  const cleanup = () => {
    try {
      fs.rmSync(jobDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('No se pudo limpiar el directorio del trabajo:', error.message);
    }
  };

  try {
    let info = null;
    let method = 'lite';
    let fallbackUsed = false;
    const rendererConfigured = Boolean(process.env.RENDERER_URL);

    // Intento 1: renderizador externo (siempre intentar primero si está configurado,
    // porque es el único que hace scroll y obtiene TODAS las imágenes)
    if (rendererConfigured) {
      try {
        info = await extractPresentationInfoViaRenderer(normalizedUrl);
        method = 'renderer';
        fallbackUsed = false;
      } catch (rendererError) {
        console.warn('Renderizador externo falló:', rendererError.message);
        info = null;
      }
    }

    // Intento 2: fetch directo (solo como fallback si el renderizador no está configurado o falló)
    if (!info) {
      try {
        info = await extractPresentationInfoLite(normalizedUrl);
        method = 'lite';
      } catch (error) {
        console.warn('Fetch directo falló:', error.message);
      }
    }

    if (!info) {
      throw createServiceError('No se pudo inspeccionar la presentación. Intenta nuevamente o configura un servidor de renderizado externo.', 503);
    }

    const imageUrls = selectSlideImages(info.imageUrls);
    const title = cleanSlideTitle(info.title) || DEFAULT_TITLE;

    if (!imageUrls.length) {
      throw createServiceError('No se encontraron imágenes válidas para convertir la presentación.', 422);
    }

    const result = await buildPresentationFileFromImages(imageUrls, extension, jobDir, title, selectedQuality);

    return {
      success: true,
      jobId,
      title,
      format: extension,
      quality: selectedQuality,
      imageCount: imageUrls.length,
      fileName: result.filename,
      filePath: result.outputFile,
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
  normalizeSlideShareUrl,
  sanitizeFileName,
  cleanSlideTitle,
  extractPresentationInfo,
  extractPresentationInfoLite,
  extractPresentationInfoViaRenderer,
  selectSlideImages,
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
  applyImageQuality,
  getImageCandidates,
  downloadImage
};
