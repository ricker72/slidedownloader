/**
 * Configuración centralizada de SlideDownloader.
 *
 * Dos semánticas deliberadamente distintas:
 * - Los límites numéricos se capturan al cargar el módulo (`getLimits()`).
 *   `/api/limits`, el recorte de diapositivas y la conversión WebP deben
 *   reflejar la configuración con la que arrancó la instancia.
 * - Las banderas y URLs se leen en cada petición (`getRuntime()`). Los tests
 *   y el propio servidor pueden cambiar `OCR_ENABLED`, `RENDERER_URL` o
 *   `JOB_TTL_MS` sin reiniciar el proceso.
 */

const path = require('path');

const ROOT_DIR = __dirname;
const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const isProduction = process.env.NODE_ENV === 'production';
const profile = isVercel ? 'vercel' : 'local';

const DOWNLOADS_DIR = isVercel
  ? path.join('/tmp', 'slidedownloader-downloads')
  : path.join(ROOT_DIR, 'downloads');

const DEFAULT_TITLE = 'presentacion';
const SUPPORTED_FORMATS = ['pdf', 'pptx', 'ppsx', 'potx', 'docx', 'txt', 'md'];
const QUALITY_LEVELS = ['sd', 'hd'];
const PREVIEW_LIMIT = 200;
const WEBP_CONVERSION_MODES = ['auto', 'jpeg', 'png'];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
];

function readPositiveInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function readIntInRange(name, fallback, min, max) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function resolveConversionMode(value, fallback = 'auto') {
  const mode = String(value ?? '').toLowerCase();
  return WEBP_CONVERSION_MODES.includes(mode) ? mode : fallback;
}

const JPEG_QUALITY = readIntInRange('JPEG_QUALITY', 92, 1, 100);
const WEBP_PNG_MAX_BYTES = readPositiveInt('WEBP_PNG_MAX_BYTES', 8 * 1024 * 1024);
const WEBP_CONVERSION = resolveConversionMode(process.env.WEBP_CONVERSION);

function resolveJpegQuality(value) {
  const candidate = Number(value);
  return Number.isInteger(candidate) && candidate >= 1 && candidate <= 100
    ? candidate
    : JPEG_QUALITY;
}

function resolvePngMaxBytes(value) {
  const candidate = Number(value);
  return Number.isInteger(candidate) && candidate > 0 ? candidate : WEBP_PNG_MAX_BYTES;
}

const MAX_SLIDES = readPositiveInt('MAX_SLIDES', isVercel ? 80 : 200);
const MAX_IMAGE_BYTES = readPositiveInt('MAX_IMAGE_BYTES', 15 * 1024 * 1024);
const MAX_TOTAL_IMAGE_BYTES = readPositiveInt(
  'MAX_TOTAL_IMAGE_BYTES',
  isVercel ? 80 * 1024 * 1024 : 160 * 1024 * 1024
);
const IMAGE_CONCURRENCY = readPositiveInt('IMAGE_CONCURRENCY', isVercel ? 8 : 10);
const IMAGE_TIMEOUT_MS = readPositiveInt('IMAGE_TIMEOUT_MS', isVercel ? 15000 : 30000);
const MAX_DOWNLOAD_MS = readPositiveInt('MAX_DOWNLOAD_MS', isVercel ? 35000 : 5 * 60 * 1000);
const ESTIMATED_BYTES_PER_SLIDE_SD = readPositiveInt('ESTIMATED_BYTES_PER_SLIDE_SD', 120 * 1024);
const ESTIMATED_BYTES_PER_SLIDE_HD = readPositiveInt('ESTIMATED_BYTES_PER_SLIDE_HD', 450 * 1024);

// Presupuesto de compresión de Scribd en serverless (0 = sin compresión).
// Se respeta el valor configurado; el fallback solo aplica cuando VERCEL está
// activo, tal como en la implementación original de scribdService.
const MAX_OUTPUT_IMAGE_BYTES = (() => {
  const configured = Number(process.env.MAX_OUTPUT_IMAGE_BYTES);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return process.env.VERCEL ? 4 * 1024 * 1024 : 0;
})();

const LIMITS = Object.freeze({
  maxSlides: MAX_SLIDES,
  maxImageBytes: MAX_IMAGE_BYTES,
  maxTotalImageBytes: MAX_TOTAL_IMAGE_BYTES,
  maxDownloadMs: MAX_DOWNLOAD_MS,
  imageConcurrency: IMAGE_CONCURRENCY,
  previewLimit: PREVIEW_LIMIT,
  bytesPerSlide: Object.freeze({
    sd: ESTIMATED_BYTES_PER_SLIDE_SD,
    hd: ESTIMATED_BYTES_PER_SLIDE_HD
  }),
  webpConversion: Object.freeze({
    mode: WEBP_CONVERSION,
    jpegQuality: JPEG_QUALITY,
    pngMaxBytes: WEBP_PNG_MAX_BYTES
  })
});

/** Devuelve una copia: los consumidores no pueden mutar el snapshot. */
function getLimits() {
  return {
    ...LIMITS,
    bytesPerSlide: { ...LIMITS.bytesPerSlide },
    webpConversion: { ...LIMITS.webpConversion }
  };
}

/**
 * Valores que hoy se leen en cada petición o llamada. Se devuelve un objeto
 * nuevo para que un consumidor no pueda alterar el entorno de otro.
 */
function getRuntime() {
  return {
    profile,
    isVercel,
    isProduction: process.env.NODE_ENV === 'production',
    port: process.env.PORT || 8080,
    jobsEnabled: process.env.JOBS_ENABLED === 'true',
    ocrEnabled: process.env.OCR_ENABLED === 'true',
    rendererUrl: process.env.RENDERER_URL || '',
    rendererSecret: String(process.env.RENDERER_SECRET || '').trim(),
    ocrCacheDir: String(process.env.OCR_CACHE_DIR || '').trim(),
    ocrLang: process.env.OCR_LANG,
    ocrMaxSlides: process.env.OCR_MAX_SLIDES,
    ocrTimeoutMs: process.env.OCR_TIMEOUT_MS,
    allowedOrigins: process.env.ALLOWED_ORIGINS || 'http://localhost:8080',
    corsOrigin: String(process.env.CORS_ORIGIN || '').trim(),
    googleCseId: String(process.env.GOOGLE_CSE_ID || '').trim(),
    jobTtlMs: Number(process.env.JOB_TTL_MS),
    maxJobQueue: Number(process.env.MAX_JOB_QUEUE) || 50,
    maxJobAttempts: Number(process.env.MAX_JOB_ATTEMPTS),
    scribdRelayUrl: String(process.env.SCRIBD_RELAY_URL || '').trim(),
    scribdRelaySecret: String(process.env.SCRIBD_RELAY_SECRET || '').trim(),
    scribdRelayTimeoutMs: readPositiveInt('SCRIBD_RELAY_TIMEOUT_MS', 20000),
    rendererMaxConcurrent: readPositiveInt('MAX_CONCURRENT_RENDERS', 2),
    rendererMaxQueued: Number(process.env.MAX_QUEUED_RENDERS) || 0,
    rendererQueueTimeoutMs: readPositiveInt('QUEUE_TIMEOUT_MS', 30000),
    rendererTimeoutMs: readPositiveInt('RENDER_TIMEOUT_MS', 120000)
  };
}

module.exports = {
  ROOT_DIR,
  DOWNLOADS_DIR,
  DEFAULT_TITLE,
  SUPPORTED_FORMATS,
  QUALITY_LEVELS,
  PREVIEW_LIMIT,
  WEBP_CONVERSION_MODES,
  USER_AGENTS,
  JPEG_QUALITY,
  WEBP_PNG_MAX_BYTES,
  WEBP_CONVERSION,
  MAX_SLIDES,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
  IMAGE_CONCURRENCY,
  IMAGE_TIMEOUT_MS,
  MAX_DOWNLOAD_MS,
  ESTIMATED_BYTES_PER_SLIDE_SD,
  ESTIMATED_BYTES_PER_SLIDE_HD,
  MAX_OUTPUT_IMAGE_BYTES,
  isVercel,
  isProduction,
  profile,
  getLimits,
  getRuntime,
  readPositiveInt,
  readIntInRange,
  resolveConversionMode,
  resolveJpegQuality,
  resolvePngMaxBytes
};
