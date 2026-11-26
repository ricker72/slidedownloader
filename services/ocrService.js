/**
 * OCR opt-in para exportar el texto real de las diapositivas.
 *
 * La carga de `tesseract.js` (WASM + modelo de idioma) es perezosa: mientras
 * OCR_ENABLED no esté activo, este módulo no carga la dependencia ni descarga
 * modelos. Las diapositivas se descargan con el mismo límite de bytes que el
 * resto de la aplicación y se procesan con un único worker secuencial.
 *
 * El texto reconocido se trata como dato no fiable: nunca se interpreta como
 * instrucciones y se normaliza antes de escribirse en el archivo.
 */

const DEFAULT_LANG = 'eng';
const DEFAULT_MAX_SLIDES = 10;
const DEFAULT_TIMEOUT_MS = 20000;
const LANG_PATTERN = /^[a-zA-Z_]{2,20}$/;

function readPositiveInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeLang(value) {
  const lang = String(value || '').trim();
  return LANG_PATTERN.test(lang) ? lang : DEFAULT_LANG;
}

function normalizeRecognizedText(value) {
  return String(value == null ? '' : value)
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function withTimeout(promise, timeoutMs, stage) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout en ${stage}`)), timeoutMs);
  });

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

/**
 * @param {object} options
 * @param {boolean} options.enabled - solo true activa el OCR.
 * @param {Function} options.downloadImage - (url, quality) => Promise<Buffer>.
 * @param {string} [options.lang] - código de idioma de Tesseract.
 * @param {number|string} [options.maxSlides] - tope de diapositivas (1-50).
 * @param {number|string} [options.timeoutMs] - timeout por diapositiva.
 * @param {string} [options.cacheDir] - directorio local del modelo descargado.
 * @param {Function} [options.createWorker] - inyección para pruebas.
 */
function createOcrEngine(options = {}) {
  const enabled = options.enabled === true;
  const lang = normalizeLang(options.lang);
  const maxSlides = readPositiveInt(options.maxSlides, DEFAULT_MAX_SLIDES, 1, 50);
  const timeoutMs = readPositiveInt(options.timeoutMs, DEFAULT_TIMEOUT_MS, 1000, 120000);
  const quality = options.quality === 'hd' ? 'hd' : 'sd';
  const cacheDir = typeof options.cacheDir === 'string' ? options.cacheDir.trim() : '';
  const downloadImage = options.downloadImage;
  const createWorker = options.createWorker;
  let workerPromise = null;

  function loadWorker() {
    if (!workerPromise) {
      // require perezoso: el modo normal nunca carga el motor de OCR.
      const factory = typeof createWorker === 'function'
        ? createWorker
        : require('tesseract.js').createWorker;
      const workerOptions = cacheDir ? { cachePath: cacheDir, cacheMethod: 'write' } : {};

      workerPromise = Promise.resolve().then(() => factory(lang, 1, workerOptions));
    }

    return workerPromise;
  }

  async function recognizeSlides(imageUrls) {
    if (!enabled) return [];

    const urls = (Array.isArray(imageUrls) ? imageUrls : [])
      .filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url))
      .slice(0, maxSlides);

    if (!urls.length) return [];
    if (typeof downloadImage !== 'function') {
      throw new Error('OCR requiere la función downloadImage inyectada');
    }

    const engine = await loadWorker();
    const slides = [];

    for (let index = 0; index < urls.length; index += 1) {
      const slide = index + 1;

      try {
        const buffer = await withTimeout(downloadImage(urls[index], quality), timeoutMs, 'la descarga');
        const result = await withTimeout(engine.recognize(buffer), timeoutMs, 'el OCR');
        const text = normalizeRecognizedText(result && result.data && result.data.text);
        slides.push({ slide, text, error: null });
      } catch (error) {
        // Un fallo aislado no debe impedir exportar el resto de diapositivas.
        slides.push({ slide, text: '', error: `No se pudo procesar la diapositiva ${slide}` });
      }
    }

    return slides;
  }

  async function terminate() {
    if (!workerPromise) return;

    try {
      const engine = await workerPromise;
      if (engine && typeof engine.terminate === 'function') await engine.terminate();
    } catch (error) {
      // La creación del worker ya falló; no hay recursos que liberar.
    } finally {
      workerPromise = null;
    }
  }

  return { enabled, recognizeSlides, terminate };
}

module.exports = {
  createOcrEngine,
  DEFAULT_LANG,
  DEFAULT_MAX_SLIDES,
  DEFAULT_TIMEOUT_MS
};
