// Elementos del DOM
const urlInput = document.getElementById('url-input');
const pasteBtn = document.getElementById('paste-btn');
const detectBtn = document.getElementById('detect-btn');
const downloadBtn = document.getElementById('download-btn');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const statusDetail = document.getElementById('status-detail');
const previewSection = document.getElementById('preview-section');
const previewGrid = document.getElementById('preview-grid');
const previewCount = document.getElementById('preview-count');

// Estado actual
let currentFormat = 'pptx';
let currentQuality = 'sd';
let isProcessing = false;

// Detección automática
let inspectTimer = null;
let inspectController = null;
let lastInspectedUrl = '';

const PREVIEW_LIMIT = 200;
const AUTO_INSPECT_DELAY = 900;

const FORMAT_NAMES = {
  pptx: 'PowerPoint (PPTX)',
  ppsx: 'Presentación (PPSX)',
  potx: 'Plantilla (POTX)',
  pdf: 'PDF',
  docx: 'Word (DOCX)',
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
  downloadBtn.addEventListener('click', handleDownload);

  urlInput.addEventListener('input', handleUrlChange);
  urlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      handleDownload();
    }
  });

  for (const input of document.querySelectorAll('input[name="quality"]')) {
    input.addEventListener('change', () => {
      currentQuality = input.value;
    });
  }

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

    showStatus('success', 'Presentación detectada');
    showDetail([
      ['Título', data.title],
      ['Diapositivas', data.slideCount != null ? String(data.slideCount) : ''],
      ['URL', data.url || url],
    ]);
    renderPreview(data.galleryImages || data.previewImages || [], data.slideCount || 0);

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

/**
 * Pintar la cuadrícula de vista previa con las primeras diapositivas.
 */
function renderPreview(images, total) {
  if (!previewSection || !previewGrid) return;

  previewGrid.textContent = '';

  const validImages = (images || []).filter(Boolean).slice(0, PREVIEW_LIMIT);
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

    figure.append(image);
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

  showStatus('info', 'Preparando descarga...');
  setLoading(true);

  try {
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format: currentFormat, quality: currentQuality }),
    });

    const data = await readJson(response);

    if (response.ok && data.success) {
      showStatus('success', 'Descarga lista');
      showDownloadLink(data, url);
    } else {
      const message = data.error || 'Error al procesar la descarga';
      showStatus('error', message);
      showErrorMessage(message);
    }
  } catch (error) {
    showStatus('error', 'Error de conexión');
    showErrorMessage('No se pudo contactar con el servidor.');
    console.error('Error:', error);
  } finally {
    setLoading(false);
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
 * Mostrar enlace de descarga y lanzarla.
 */
function showDownloadLink(data, fallbackUrl) {
  showDetail([
    ['Título', data.title],
    ['Formato', getFormatName(data.format)],
    ['Calidad', getQualityName(data.quality)],
    ['Diapositivas', data.slideCount != null ? String(data.slideCount) : ''],
    ['URL', fallbackUrl],
  ]);

  if (!data.downloadUrl) return;

  const link = document.createElement('a');
  link.className = 'btn btn-primary';
  link.href = data.downloadUrl;
  link.textContent = 'Descargar archivo';

  // El atributo download no funciona en todos los navegadores con rutas
  // del mismo origen, pero no rompe nada si se ignora.
  link.setAttribute('download', '');

  statusDetail.append(link);
  link.click();
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
  }
}
