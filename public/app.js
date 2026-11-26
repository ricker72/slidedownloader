// Elementos del DOM
const urlInput = document.getElementById('url-input');
const pasteBtn = document.getElementById('paste-btn');
const detectBtn = document.getElementById('detect-btn');
const downloadBtn = document.getElementById('download-btn');
const backgroundBtn = document.getElementById('background-btn');
const actionNoteText = document.getElementById('action-note-text');
const jobControls = document.getElementById('job-controls');
const jobProgress = document.getElementById('job-progress');
const jobCancelBtn = document.getElementById('job-cancel-btn');
const downloadProgress = document.getElementById('download-progress');
const downloadProgressTrack = document.getElementById('download-progress-track');
const downloadProgressBar = document.getElementById('download-progress-bar');
const downloadProgressText = document.getElementById('download-progress-text');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const statusDetail = document.getElementById('status-detail');
const previewSection = document.getElementById('preview-section');
const previewGrid = document.getElementById('preview-grid');
const previewCount = document.getElementById('preview-count');
const previewLayoutBtn = document.getElementById('preview-layout-btn');
const limitsSection = document.getElementById('limits-section');
const limitsGrid = document.getElementById('limits-grid');
const limitsWarning = document.getElementById('limits-warning');
const recentSection = document.getElementById('recent-section');
const recentList = document.getElementById('recent-list');
const recentClearBtn = document.getElementById('recent-clear-btn');

// Estado actual
let currentFormat = 'pptx';
let currentQuality = 'hd';
let isProcessing = false;

// Detección automática
let inspectTimer = null;
let inspectController = null;
let lastInspectedUrl = '';
// Datos de la última vista previa: permiten descargar sin volver a renderizar.
let lastInspect = null;

const PREVIEW_LIMIT = 200;
const AUTO_INSPECT_DELAY = 900;

// Límites comunicados por el servidor; se actualizan al cargar la página.
let serverLimits = null;
let detectedSlideCount = null;
let previewLimit = PREVIEW_LIMIT;
let jobsEnabled = false;
let jobPollTimer = null;
let activeJobPollUrl = '';
let progressPollTimer = null;
let activeProgressId = '';

const PROGRESS_POLL_MS = 700;
const JOB_POLL_INITIAL_MS = 1000;
const JOB_POLL_MAX_MS = 10000;
const JOB_POLL_TIMEOUT_MS = 10 * 60 * 1000;
const numberFormatter = new Intl.NumberFormat(document.documentElement.lang || 'es', {
  maximumFractionDigits: 2
});

const FORMAT_NAMES = {
  pptx: 'PowerPoint (PPTX)',
  ppsx: 'Presentación (PPSX)',
  potx: 'Plantilla (POTX)',
  pdf: 'PDF',
  docx: 'Word (DOCX)',
  txt: 'Solo texto (TXT)',
  md: 'Markdown (MD)',
  ppt: 'PowerPoint (PPT)',
  doc: 'Word (DOC)',
};

const QUALITY_NAMES = {
  sd: 'SD (estándar)',
  hd: 'HD (alta resolución)',
};

document.addEventListener('DOMContentLoaded', () => {
  pasteBtn.addEventListener('click', handlePaste);
  detectBtn.addEventListener('click', handleDetect);
  previewLayoutBtn?.addEventListener('click', togglePreviewLayout);
  recentClearBtn?.addEventListener('click', clearRecentHistory);
  downloadBtn.addEventListener('click', handleDownload);
  backgroundBtn.addEventListener('click', handleBackgroundDownload);
  jobCancelBtn.addEventListener('click', cancelJobPolling);

  urlInput.addEventListener('input', handleUrlChange);
  urlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      handleDownload();
    }
  });

  for (const input of document.querySelectorAll('input[name="quality"]')) {
    input.addEventListener('change', () => {
      currentQuality = input.value;
      renderLimits();
    });
  }

  const savedLayout = globalThis.SlideDownloaderLocalState?.readPreference('previewLayout', 'grid');
  applyPreviewLayout(savedLayout === 'list');
  renderRecentHistory();

  loadLimits();
  checkServerStatus();
});

/**
 * Leer una respuesta como JSON, con mensaje de error legible si no lo es.
 */
async function readJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: `Respuesta no válida del servidor (HTTP ${response.status})`,
    };
  }
}

/**
 * Comprobar si el texto parece una URL de SlideShare.
 */
function isSlideShareUrl(value) {
  if (!value || typeof value !== 'string') return false;

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const { hostname } = new URL(withProtocol);
    const host = hostname.toLowerCase();
    return host === 'slideshare.net' || host.endsWith('.slideshare.net');
  } catch (error) {
    return false;
  }
}

/**
 * Detectar la presentación automáticamente al escribir o pegar una URL.
 */
function handleUrlChange() {
  clearTimeout(inspectTimer);

  // Cancelar una detección en curso: su resultado ya no corresponde a la URL actual.
  if (inspectController) {
    inspectController.abort();
    inspectController = null;
  }

  clearPreview();
  lastInspectedUrl = '';
  lastInspect = null;
  detectedSlideCount = null;
  renderLimits();

  if (isProcessing) return;

  const url = urlInput.value.trim();
  if (!isSlideShareUrl(url)) return;

  inspectTimer = setTimeout(() => {
    if (url === lastInspectedUrl) return;
    inspectUrl(url, { automatic: true });
  }, AUTO_INSPECT_DELAY);
}

/**
 * Manejar botón pegar
 */
async function handlePaste() {
  try {
    const text = await navigator.clipboard.readText();

    if (!text || !text.trim()) {
      showStatus('warning', 'El portapapeles está vacío');
      return;
    }

    urlInput.value = text.trim();
    showStatus('info', 'Detectando presentación...');
    handleUrlChange();
  } catch (error) {
    showStatus('error', 'No se pudo acceder al portapapeles');
    console.error('Error:', error);
  }
}

/**
 * Manejar botón detectar
 */
async function handleDetect() {
  const url = urlInput.value.trim();

  if (!url) {
    showStatus('error', 'Ingresa una URL primero');
    return;
  }

  if (isProcessing) return;

  clearTimeout(inspectTimer);
  await inspectUrl(url);
}

/**
 * Inspeccionar una presentación y mostrar su vista previa.
 *
 * @param {string} url - URL de SlideShare
 * @param {{ automatic?: boolean }} options - La detección automática no bloquea la UI
 */
async function inspectUrl(url, { automatic = false } = {}) {
  if (inspectController) {
    inspectController.abort();
  }

  const controller = new AbortController();
  inspectController = controller;
  lastInspect = null;

  showStatus('info', 'Detectando presentación...');
  if (!automatic) {
    setLoading(true);
    showDetail([]);
  }

  try {
    const response = await fetch('/api/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    const data = await readJson(response);

    if (!response.ok || !data.success) {
      const message = data.error || 'No se pudo detectar la presentación';

      if (automatic) {
        clearPreview();
        showStatus('warning', message);
      } else {
        showStatus('error', message);
        showErrorMessage(message);
      }
      return;
    }

    lastInspectedUrl = data.url || url;

    // Fallback: /api/inspect también incluye los límites por si /api/limits
    // no estuvo disponible al cargar la página.
    if (!serverLimits && data.limits) applyLimits(data.limits);

    const detected = Number(data.detectedSlideCount ?? data.slideCount);
    detectedSlideCount = Number.isFinite(detected) ? detected : null;
    renderLimits();

    const gallery = data.galleryImages || data.previewImages || [];
    lastInspect = {
      url: lastInspectedUrl,
      title: data.title || '',
      images: gallery.slice(0, previewLimit),
    };

    showStatus('success', 'Presentación detectada');
    showDetail([
      ['Título', data.title],
      ['Diapositivas', data.slideCount != null ? String(data.slideCount) : ''],
      ['URL', data.url || url],
    ]);
    renderPreview(gallery, data.slideCount || 0);

    if (data.challengeDetected) {
      showStatus('warning', 'SlideShare pidió una verificación; la vista previa puede estar incompleta');
    }
  } catch (error) {
    if (error.name === 'AbortError') return;

    if (automatic) {
      clearPreview();
      showStatus('warning', 'No se pudo detectar la presentación');
      return;
    }

    showStatus('error', 'Error de conexión');
    showErrorMessage('No se pudo contactar con el servidor.');
    console.error('Error:', error);
  } finally {
    if (inspectController === controller) {
      inspectController = null;
    }
    if (!automatic) {
      setLoading(false);
    }
  }
}

/** Aplicar el modo lista guardado, si el almacenamiento local está disponible. */
function applyPreviewLayout(isList) {
  if (!previewGrid || !previewLayoutBtn) return;

  previewGrid.classList.toggle('preview-grid--list', Boolean(isList));
  previewLayoutBtn.setAttribute('aria-pressed', isList ? 'true' : 'false');
  previewLayoutBtn.textContent = isList ? 'Vista cuadrícula' : 'Vista lista';
}

function togglePreviewLayout() {
  const isList = previewLayoutBtn?.getAttribute('aria-pressed') !== 'true';
  applyPreviewLayout(isList);
  globalThis.SlideDownloaderLocalState?.writePreference('previewLayout', isList ? 'list' : 'grid');
}

/**
 * Pintar la cuadrícula de vista previa con las primeras diapositivas.
 */
function renderPreview(images, total) {
  if (!previewSection || !previewGrid) return;

  previewGrid.textContent = '';

  const validImages = (images || []).filter(Boolean).slice(0, previewLimit);
  if (!validImages.length) {
    previewSection.hidden = true;
    return;
  }

  previewSection.hidden = false;

  if (previewCount) {
    previewCount.textContent =
      total > validImages.length
        ? `Mostrando ${validImages.length} de ${total}`
        : `${total} diapositiva${total === 1 ? '' : 's'}`;
  }

  validImages.forEach((src, index) => {
    const figure = document.createElement('figure');
    figure.className = 'preview-item';

    const image = document.createElement('img');
    image.src = src;
    image.alt = `Diapositiva ${index + 1}`;
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';

    // Si el CDN no tiene la variante de 638 px, reintentar con la de 320 px
    // antes de descartar la miniatura.
    image.addEventListener('error', () => {
      if (!image.dataset.retried && /-638\.(jpe?g|png|webp)/i.test(image.src)) {
        image.dataset.retried = '1';
        image.src = image.src.replace(/-638\.(jpe?g|png|webp)/i, '-320.$1');
        return;
      }

      figure.remove();
    });

    const indexLabel = document.createElement('span');
    indexLabel.className = 'preview-index';
    indexLabel.setAttribute('aria-hidden', 'true');
    indexLabel.textContent = String(index + 1);

    figure.append(image, indexLabel);
    previewGrid.append(figure);
  });
}

/**
 * Ocultar y vaciar la vista previa.
 */
function clearPreview() {
  if (!previewSection || !previewGrid) return;
  previewGrid.textContent = '';
  previewSection.hidden = true;
}

/**
 * Comparar dos URLs de SlideShare sin depender de barras o mayúsculas.
 */
function isSamePresentation(a, b) {
  if (!a || !b) return false;

  const normalize = (value) => {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withProtocol).href.replace(/\/+$/, '').toLowerCase();
  };

  try {
    return normalize(a) === normalize(b);
  } catch (error) {
    return false;
  }
}

/**
 * Construir el cuerpo común de las descargas sincrónica y en background.
 */
function buildDownloadPayload(url, { progressId = '' } = {}) {
  const payload = { url, format: currentFormat, quality: currentQuality };
  if (progressId) payload.progressId = progressId;

  // Reutilizar las diapositivas ya detectadas evita la llamada lenta al
  // renderizador y reduce bastante el tiempo de descarga en HD.
  if (lastInspect && lastInspect.images.length && isSamePresentation(lastInspect.url, url)) {
    payload.imageUrls = lastInspect.images;
    if (lastInspect.title) payload.title = lastInspect.title;
  }

  return payload;
}

/**
 * Mostrar u ocultar la opción de procesamiento en background según el
 * servidor. El modo sincrónico sigue siendo el único disponible por defecto.
 */
function renderJobsOption() {
  if (!backgroundBtn || !actionNoteText) return;

  backgroundBtn.hidden = !jobsEnabled;
  actionNoteText.textContent = jobsEnabled
    ? 'Puedes descargar al instante o procesar en segundo plano para presentaciones grandes.'
    : 'Tu archivo se genera al instante y se descarga directamente.';
}

/** ID aleatorio de un solo uso para consultar el progreso sin exponer la URL. */
function createProgressId() {
  const webCrypto = globalThis.crypto;

  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  // `randomUUID` solo está en contextos seguros; en HTTP local seguimos
  // generando un UUID v4 con la misma API criptográfica del navegador.
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return '';
}

/** Etapas legibles, compartidas por la descarga instantánea y los trabajos. */
function describeDownloadProgress(progress = {}) {
  const stage = progress.stage || 'preparing';

  if (stage === 'analyzing') return 'Analizando…';
  if (stage === 'downloading-images') {
    return progress.total
      ? `Descargando ${progress.current || 0}/${progress.total}…`
      : 'Descargando diapositivas…';
  }
  if (stage === 'generating-file') {
    return `Generando ${String(progress.format || currentFormat).toUpperCase()}…`;
  }
  if (stage === 'done') return 'Preparando archivo…';
  if (stage === 'failed') return 'No se pudo completar la descarga';
  return 'Preparando descarga…';
}

/** Pintar la barra sin inyectar HTML y sin superar los límites del atributo. */
function renderDownloadProgress(progress) {
  if (!downloadProgress || !downloadProgressTrack || !downloadProgressBar || !downloadProgressText) return;

  const percent = Math.min(Math.max(Number(progress.percent) || 0, 0), 100);
  const message = describeDownloadProgress(progress);

  downloadProgressBar.style.width = `${percent}%`;
  downloadProgressTrack.setAttribute('aria-valuenow', String(Math.round(percent)));
  downloadProgressText.textContent = progress.failed
    ? `${message} · ${progress.failed} diapositivas omitidas`
    : message;
  statusText.textContent = message;
}

/** Sondeo best-effort: un 404 (otra instancia en Vercel) degrada a texto. */
function startDownloadProgressPolling(id) {
  stopDownloadProgressPolling();
  if (!id || !downloadProgress) return;

  activeProgressId = id;
  downloadProgress.hidden = false;
  renderDownloadProgress({ stage: 'preparing', percent: 5 });

  const poll = async () => {
    if (!activeProgressId) return;

    try {
      const response = await fetch(`/api/progress/${encodeURIComponent(activeProgressId)}`);

      if (response.status === 404) {
        activeProgressId = '';
        downloadProgressText.textContent = 'Procesando descarga…';
        return;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (data.success && data.progress && activeProgressId) {
        renderDownloadProgress(data.progress);
      }
    } catch (error) {
      // Un fallo puntual del sondeo no debe afectar a la descarga en curso.
    }

    if (activeProgressId) {
      progressPollTimer = setTimeout(poll, PROGRESS_POLL_MS);
    }
  };

  poll();
}

function stopDownloadProgressPolling() {
  clearTimeout(progressPollTimer);
  progressPollTimer = null;
  activeProgressId = '';
  if (downloadProgress) downloadProgress.hidden = true;
}

/** Dibujar el historial con nodos de texto: nunca con HTML del almacenamiento. */
function renderRecentHistory(entries) {
  if (!recentSection || !recentList) return;

  const items = Array.isArray(entries)
    ? entries
    : (globalThis.SlideDownloaderLocalState?.readRecent() || []);

  recentSection.hidden = items.length === 0;
  recentList.textContent = '';

  for (const entry of items) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recent-item';

    const title = document.createElement('span');
    title.className = 'recent-title';
    title.textContent = entry.title || 'Presentación sin título';

    const meta = document.createElement('span');
    meta.className = 'recent-meta';
    const quality = entry.quality === 'hd' ? 'HD' : 'SD';
    const slides = entry.slideCount != null ? ` · ${entry.slideCount} diapositivas` : '';
    meta.textContent = `${getFormatName(entry.format)} · ${quality}${slides}`;

    button.append(title, meta);
    button.addEventListener('click', () => restoreRecentEntry(entry));
    item.append(button);
    recentList.append(item);
  }
}

function rememberDownload(metadata, fileName) {
  const url = urlInput.value.trim() || lastInspect?.url || '';
  if (!url) return;

  const entries = globalThis.SlideDownloaderLocalState?.addRecent({
    url,
    title: metadata.title || lastInspect?.title || '',
    format: metadata.format || currentFormat,
    quality: metadata.quality || currentQuality,
    slideCount: metadata.slideCount,
    fileName
  }) || [];

  renderRecentHistory(entries);
}

function clearRecentHistory() {
  globalThis.SlideDownloaderLocalState?.clearRecent();
  renderRecentHistory([]);
}

function restoreRecentEntry(entry) {
  urlInput.value = entry.url;
  currentFormat = entry.format || currentFormat;
  currentQuality = entry.quality || currentQuality;

  const formatInput = document.querySelector(`input[name="format"][value="${currentFormat}"]`);
  if (formatInput && !formatInput.disabled) formatInput.checked = true;

  const qualityInput = document.querySelector(`input[name="quality"][value="${currentQuality}"]`);
  if (qualityInput) qualityInput.checked = true;

  clearPreview();
  lastInspect = null;
  lastInspectedUrl = '';
  detectedSlideCount = null;
  renderLimits();
  inspectUrl(entry.url);
}

/**
 * Manejar descarga
 */
async function handleDownload() {
  const url = urlInput.value.trim();

  if (!url) {
    showStatus('error', 'Ingresa una URL primero');
    return;
  }

  if (isProcessing) return;

  const selectedFormat = document.querySelector('input[name="format"]:checked');
  if (!selectedFormat) {
    showStatus('error', 'Selecciona un formato de descarga');
    return;
  }
  currentFormat = selectedFormat.value;

  const selectedQuality = document.querySelector('input[name="quality"]:checked');
  if (selectedQuality) {
    currentQuality = selectedQuality.value;
  }

  clearTimeout(inspectTimer);

  // Una detección pendiente no debe pisar el estado de la descarga.
  if (inspectController) {
    inspectController.abort();
    inspectController = null;
  }

  const progressId = createProgressId();
  const payload = buildDownloadPayload(url, { progressId });

  showStatus('info', currentQuality === 'hd' ? 'Preparando descarga en HD...' : 'Preparando descarga...');
  setLoading(true);
  startDownloadProgressPolling(progressId);

  try {
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await DownloadUtils.readErrorMessage(
        response,
        'Error al procesar la descarga'
      );
      showStatus('error', message);
      showErrorMessage(message);
      return;
    }

    if (DownloadUtils.isJsonResponse(response)) {
      // Respuesta inesperada del servidor (por ejemplo, un proxy intermedio).
      const data = await readJson(response);
      const message = data.error || 'El servidor no devolvió el archivo generado';
      showStatus('error', message);
      showErrorMessage(message);
      return;
    }

    const metadata = DownloadUtils.readMetadata(response);
    const { fileName } = await DownloadUtils.saveResponseAsFile(
      response,
      `presentacion.${currentFormat}`
    );

    const failedSlides = Number(metadata.failedSlideCount) || 0;
    const detailRows = [
      ['Título', metadata.title || lastInspect?.title || ''],
      ['Formato', getFormatName(metadata.format || currentFormat)],
      ['Calidad', getQualityName(metadata.quality || currentQuality)],
      ['Diapositivas', metadata.slideCount != null ? String(metadata.slideCount) : ''],
      ['Archivo', fileName],
    ];

    if (failedSlides > 0) {
      detailRows.push([
        'Avisos',
        (metadata.warnings || []).join(' ') || `${failedSlides} diapositivas no incluidas en el archivo.`
      ]);
    }

    showStatus(
      failedSlides > 0 ? 'warning' : 'success',
      failedSlides > 0 ? 'Descarga lista con avisos' : 'Descarga lista'
    );
    showDetail(detailRows);
    rememberDownload(metadata, fileName);
  } catch (error) {
    showStatus('error', 'Error de conexión');
    showErrorMessage('No se pudo contactar con el servidor.');
    console.error('Error:', error);
  } finally {
    stopDownloadProgressPolling();
    setLoading(false);
  }
}

/**
 * Encolar la descarga en segundo plano (solo si el servidor lo habilitó).
 */
async function handleBackgroundDownload() {
  const url = urlInput.value.trim();

  if (!url) {
    showStatus('error', 'Ingresa una URL primero');
    return;
  }

  if (isProcessing) return;

  const selectedFormat = document.querySelector('input[name="format"]:checked');
  if (!selectedFormat) {
    showStatus('error', 'Selecciona un formato de descarga');
    return;
  }
  currentFormat = selectedFormat.value;

  const selectedQuality = document.querySelector('input[name="quality"]:checked');
  if (selectedQuality) currentQuality = selectedQuality.value;

  clearTimeout(inspectTimer);
  if (inspectController) {
    inspectController.abort();
    inspectController = null;
  }

  setLoading(true);
  showStatus('info', 'Encolando trabajo...');

  try {
    const response = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildDownloadPayload(url)),
    });
    const data = await readJson(response);

    if (!response.ok || !data.success || !data.pollUrl) {
      throw new Error(data.error || 'No se pudo encolar el trabajo');
    }

    activeJobPollUrl = data.pollUrl;
    showStatus('info', 'Trabajo en cola. Consultaremos el estado automáticamente.');
    jobControls.hidden = false;
    jobProgress.textContent = 'Procesando en segundo plano…';
    pollJob({ startedAt: Date.now(), delay: JOB_POLL_INITIAL_MS, failures: 0 });
  } catch (error) {
    setLoading(false);
    showStatus('error', error.message || 'No se pudo encolar el trabajo');
    showErrorMessage(error.message || 'No se pudo encolar el trabajo.');
  }
}

/** Detener el sondeo y ocultar sus controles. */
function stopJobPolling() {
  clearTimeout(jobPollTimer);
  jobPollTimer = null;
  activeJobPollUrl = '';
  if (jobControls) jobControls.hidden = true;
  if (jobProgress) jobProgress.textContent = '';
}

/** Respetar `pollAfterMs` / `Retry-After`, con límites y backoff acotados. */
function nextPollDelay(data, fallbackDelay) {
  const retryAfter = Number(data?.retryAfter);
  const pollAfter = Number(data?.pollAfterMs);
  const candidate = Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter * 1000
    : Number.isFinite(pollAfter) && pollAfter > 0
      ? pollAfter
      : Math.round(fallbackDelay * 1.5);

  return Math.min(Math.max(candidate, 1000), 30000);
}

/** Permitir al usuario dejar de sondear sin cancelar el trabajo del servidor. */
function cancelJobPolling() {
  if (!activeJobPollUrl) return;

  stopJobPolling();
  setLoading(false);
  showStatus('idle', 'Sondeo cancelado en esta página');
  showDetail([['Nota', 'El trabajo puede seguir generándose en el servidor.']]);
}

/**
 * Sondear el estado del trabajo con backoff exponencial acotado.
 */
function pollJob({ startedAt, delay, failures }) {
  clearTimeout(jobPollTimer);
  if (!activeJobPollUrl) return;

  jobPollTimer = setTimeout(async () => {
    if (!activeJobPollUrl) return;

    if (Date.now() - startedAt > JOB_POLL_TIMEOUT_MS) {
      stopJobPolling();
      setLoading(false);
      showStatus('error', 'El trabajo está tardando demasiado');
      showErrorMessage('La generación superó el tiempo de espera de esta página.');
      return;
    }

    try {
      const response = await fetch(activeJobPollUrl);
      const data = await readJson(response);

      if (response.status === 429 && failures < 2) {
        pollJob({
          startedAt,
          delay: nextPollDelay(data, delay),
          failures: failures + 1
        });
        return;
      }

      if (!response.ok || !data.success || !data.job) {
        throw new Error(data.error || 'No se pudo consultar el estado');
      }

      const job = data.job;
      if (job.status === 'queued' || job.status === 'running') {
        const stageText = job.detail
          || describeDownloadProgress({ stage: job.stage, format: currentFormat });
        jobProgress.textContent = job.status === 'queued'
          ? 'En cola…'
          : `${stageText} · ${numberFormatter.format(Number(job.progress) || 0)}%`;
        pollJob({
          startedAt,
          delay: nextPollDelay(data, delay),
          failures: 0
        });
        return;
      }

      stopJobPolling();
      setLoading(false);

      if (job.status === 'done') {
        showJobResult(job);
      } else {
        showStatus('error', 'El trabajo no se pudo completar');
        showErrorMessage(job.error || 'El servidor no pudo generar el archivo.');
      }
    } catch (error) {
      if (failures < 2 && activeJobPollUrl) {
        pollJob({
          startedAt,
          delay: Math.min(Math.round(delay * 1.5), JOB_POLL_MAX_MS),
          failures: failures + 1
        });
        return;
      }

      stopJobPolling();
      setLoading(false);
      showStatus('error', 'No se pudo consultar el trabajo');
      showErrorMessage('Perdimos la conexión con el servidor mientras se generaba el archivo.');
      console.error('Error al sondear el trabajo:', error);
    }
  }, delay);
}

/**
 * Mostrar el enlace de descarga del trabajo ya finalizado.
 */
function showJobResult(job) {
  const result = job.result || {};
  const format = result.format || currentFormat;
  const fileName = result.fileName || `presentacion.${format}`;

  showStatus('success', 'Archivo listo para descargar');
  showDetail([
    ['Título', result.title || lastInspect?.title || ''],
    ['Formato', getFormatName(format)],
    ['Calidad', getQualityName(result.quality || currentQuality)],
    ['Diapositivas', result.slideCount != null ? String(result.slideCount) : ''],
    ['Archivo', fileName],
  ]);

  // Solo aceptamos rutas internas: nunca inyectamos HTML del servidor.
  if (typeof result.downloadUrl === 'string' && result.downloadUrl.startsWith('/api/jobs/')) {
    const paragraph = document.createElement('p');
    const link = document.createElement('a');
    link.href = result.downloadUrl;
    link.download = fileName;
    link.className = 'btn btn-primary btn-lg';
    link.textContent = 'Descargar archivo generado';
    paragraph.append(link);
    statusDetail.append(paragraph);
    link.focus();
  }
}

/**
 * Formatear bytes de forma legible para la estimación y los topes.
 */
function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '—';

  const units = ['B', 'KB', 'MB', 'GB'];
  let amount = bytes;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }

  const decimals = unit === 0 || amount >= 100 ? 0 : amount >= 10 ? 1 : 2;
  return `${numberFormatter.format(Number(amount.toFixed(decimals)))}\u00A0${units[unit]}`;
}

/**
 * Formatear el tiempo máximo de descarga.
 */
function formatDuration(ms) {
  const seconds = Math.round(Number(ms) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const formatted = numberFormatter.format(seconds >= 60 ? Math.round(seconds / 60) : seconds);
  return seconds >= 60 ? `${formatted}\u00A0min` : `${formatted}\u00A0s`;
}

/**
 * Adoptar los límites enviados por el servidor (endpoint o inspección).
 */
function applyLimits(limits) {
  if (!limits || typeof limits !== 'object') return false;

  serverLimits = limits;
  const limit = Number(limits.previewLimit);
  if (Number.isFinite(limit) && limit > 0) previewLimit = limit;
  jobsEnabled = limits.jobsEnabled === true;
  renderJobsOption();
  return true;
}

/**
 * Pintar los límites vigentes y avisar antes de superarlos.
 * Todos los nodos se rellenan con textContent: nunca se inyecta HTML.
 */
function renderLimits() {
  if (!limitsSection || !limitsGrid || !limitsWarning) return;
  if (!serverLimits) {
    limitsSection.hidden = true;
    return;
  }

  limitsSection.hidden = false;
  limitsGrid.textContent = '';

  const maxSlides = Number(serverLimits.maxSlides);
  const hasMaxSlides = Number.isFinite(maxSlides) && maxSlides > 0;
  const perSlideBytes = Number(serverLimits.bytesPerSlide?.[currentQuality]);
  const hasEstimate = Number.isFinite(perSlideBytes) && perSlideBytes > 0;
  const hasDetected = Number.isFinite(detectedSlideCount);
  const downloadable = hasMaxSlides && hasDetected
    ? Math.min(detectedSlideCount, maxSlides)
    : null;

  const rows = [];
  if (hasMaxSlides) rows.push(['Máx. diapositivas', String(maxSlides)]);
  if (hasDetected) {
    rows.push([
      'Diapositivas detectadas',
      downloadable === null
        ? String(detectedSlideCount)
        : `${detectedSlideCount} · se descargarán ${downloadable}`
    ]);
  }
  if (hasEstimate) {
    const total = hasMaxSlides ? perSlideBytes * maxSlides : perSlideBytes;
    rows.push([
      'Tamaño estimado',
      `~${formatBytes(total)} (${getQualityName(currentQuality)}, ${formatBytes(perSlideBytes)} por diapositiva)`
    ]);
  }
  if (Number.isFinite(Number(serverLimits.maxImageBytes))) {
    rows.push(['Máx. por imagen', formatBytes(serverLimits.maxImageBytes)]);
  }
  if (Number.isFinite(Number(serverLimits.maxTotalImageBytes))) {
    rows.push(['Máx. total', formatBytes(serverLimits.maxTotalImageBytes)]);
  }
  if (Number.isFinite(Number(serverLimits.maxDownloadMs))) {
    rows.push(['Tiempo máximo', formatDuration(serverLimits.maxDownloadMs)]);
  }

  for (const [label, value] of rows) {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    limitsGrid.append(term, description);
  }

  const warnings = [];
  if (hasDetected && hasMaxSlides && detectedSlideCount > maxSlides) {
    warnings.push(
      `Esta presentación tiene ${detectedSlideCount} diapositivas; solo se descargarán ${maxSlides}.`
    );
  }

  const maxTotal = Number(serverLimits.maxTotalImageBytes);
  const estimatedTotal = hasEstimate && downloadable !== null
    ? perSlideBytes * downloadable
    : hasEstimate && hasMaxSlides
      ? perSlideBytes * maxSlides
      : null;
  if (estimatedTotal !== null && Number.isFinite(maxTotal) && estimatedTotal > maxTotal) {
    warnings.push(
      `El tamaño estimado (~${formatBytes(estimatedTotal)}) supera el tope de ${formatBytes(maxTotal)}; la descarga podría rechazarse.`
    );
  }

  // El nodo permanece montado (aria-live); CSS lo oculta cuando está vacío.
  limitsWarning.textContent = warnings.join(' ');
}

/**
 * Cargar los límites del servidor al abrir la página.
 */
async function loadLimits() {
  try {
    const response = await fetch('/api/limits');
    const data = await readJson(response);
    if (response.ok && data.success && applyLimits(data)) renderLimits();
  } catch (error) {
    // La inspección intentará de nuevo con los límites que ella misma devuelve.
    console.error('No se pudieron cargar los límites:', error);
  }
}

/**
 * Verificar estado del servidor
 */
async function checkServerStatus() {
  try {
    const response = await fetch('/api/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (response.ok) {
      showStatus('success', 'Servidor conectado');
    } else {
      showStatus('error', 'Servidor no responde');
    }
  } catch (error) {
    showStatus('error', 'Servidor no disponible');
  }
}

/**
 * Mostrar estado en la interfaz
 */
function showStatus(type, message) {
  const validTypes = ['idle', 'info', 'success', 'error', 'warning'];
  const state = validTypes.includes(type) ? type : 'idle';

  statusDot.classList.remove('idle', 'info', 'success', 'error', 'warning');
  statusDot.classList.add(state);
  statusText.textContent = message;
}

/**
 * Mostrar un detalle clave/valor sin inyectar HTML.
 */
function showDetail(rows) {
  statusDetail.textContent = '';

  for (const [label, value] of rows) {
    if (!value) continue;

    const paragraph = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    paragraph.append(strong, document.createTextNode(value));
    statusDetail.append(paragraph);
  }
}

/**
 * Mostrar mensaje de error.
 */
function showErrorMessage(message) {
  statusDetail.textContent = '';

  const paragraph = document.createElement('p');
  paragraph.className = 'error-text';
  paragraph.textContent = message;
  statusDetail.append(paragraph);
}

/**
 * Obtener nombre del formato
 */
function getFormatName(format) {
  return FORMAT_NAMES[format] || format || '';
}

/**
 * Obtener nombre de la calidad
 */
function getQualityName(quality) {
  return QUALITY_NAMES[quality] || quality || '';
}

/**
 * Configurar estado de carga
 */
function setLoading(loading) {
  isProcessing = loading;

  for (const button of document.querySelectorAll('.btn')) {
    button.disabled = loading;
  }

  urlInput.disabled = loading;

  if (!loading) {
    downloadBtn.disabled = false;
    if (backgroundBtn) backgroundBtn.disabled = false;
  }
}
