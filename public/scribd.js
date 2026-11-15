/**
 * Descargador de Scribd.
 *
 * Flujo:
 * 1. `GET /api/scribd/inspect?url=` devuelve los metadatos del documento.
 * 2. `POST /api/scribd/download` genera el archivo y devuelve su URL.
 *
 * Toda la información se pinta con `textContent`; nunca se inyecta HTML
 * procedente del servidor o de Scribd.
 */

const form = document.getElementById('scribd-form');
const urlInput = document.getElementById('scribd-url');
const inspectBtn = document.getElementById('scribd-inspect-btn');
const downloadBtn = document.getElementById('scribd-download-btn');

const documentPanel = document.getElementById('scribd-document');
const titleEl = document.getElementById('scribd-title');
const pagesEl = document.getElementById('scribd-pages');
const sourceFormatsEl = document.getElementById('scribd-source-formats');
const availabilityEl = document.getElementById('scribd-availability');
const sourceLink = document.getElementById('scribd-source-link');
const thumbEl = document.getElementById('scribd-thumb');
const formatSection = document.getElementById('scribd-format-section');

const statusDot = document.getElementById('scribd-status-dot');
const statusText = document.getElementById('scribd-status-text');
const statusDetail = document.getElementById('scribd-status-detail');

const FORMAT_NAMES = {
  pdf: 'PDF',
  pptx: 'PowerPoint (PPTX)',
  ppsx: 'Presentación (PPSX)',
  potx: 'Plantilla (POTX)',
  docx: 'Word (DOCX)'
};

const SOURCE_FORMAT_NAMES = {
  pdf: 'PDF',
  doc: 'DOC',
  docx: 'DOCX',
  txt: 'Texto',
  ppt: 'PPT',
  pptx: 'PPTX',
  pps: 'PPS',
  ppsx: 'PPSX',
  pot: 'POT',
  potx: 'POTX',
  xls: 'XLS',
  xlsx: 'XLSX',
  rtf: 'RTF',
  odt: 'ODT'
};

let currentDocument = null;
let isBusy = false;

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */

function readJson(response) {
  return response.text().then((text) => {
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  });
}

function setStatus(type, message) {
  const validTypes = ['idle', 'info', 'success', 'error', 'warning'];
  const state = validTypes.includes(type) ? type : 'idle';

  statusDot.classList.remove('idle', 'info', 'success', 'error', 'warning');
  statusDot.classList.add(state);
  statusText.textContent = message;
}

function clearDetail() {
  statusDetail.replaceChildren();
}

function showDetail(rows) {
  clearDetail();

  for (const [label, value] of rows) {
    if (value === undefined || value === null || value === '') continue;

    const paragraph = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    paragraph.append(strong, document.createTextNode(String(value)));
    statusDetail.append(paragraph);
  }
}

function showErrorDetail(message) {
  clearDetail();

  const paragraph = document.createElement('p');
  paragraph.className = 'error-text';
  paragraph.textContent = message;
  statusDetail.append(paragraph);
}

function showWarnings(warnings) {
  if (!Array.isArray(warnings) || !warnings.length) return;

  const list = document.createElement('ul');
  list.className = 'scribd-warnings';

  for (const warning of warnings.slice(0, 8)) {
    const item = document.createElement('li');
    item.textContent = String(warning);
    list.append(item);
  }

  statusDetail.append(list);
}

function setBusy(busy) {
  isBusy = busy;
  urlInput.disabled = busy;
  inspectBtn.disabled = busy;
  downloadBtn.disabled = busy || !canDownload();
}

function canDownload() {
  if (!currentDocument) return false;
  if (!currentDocument.downloadable) return false;
  if (!Number.isFinite(currentDocument.pageCount) || currentDocument.pageCount < 1) return false;
  if (currentDocument.maxPages && currentDocument.pageCount > currentDocument.maxPages) return false;
  return true;
}

/**
 * Normaliza y valida el enlace antes de llamar al servidor. El servidor
 * repite la validación: esto solo evita peticiones inútiles.
 */
function normalizeInputUrl(rawValue) {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) return { error: 'Pega el enlace de un documento de Scribd.' };

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return { error: 'Escribe una URL válida de Scribd.' };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isScribdHost = hostname === 'scribd.com' || hostname.endsWith('.scribd.com');
  const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  const isDocumentPath = /^\/(?:doc|document)\/\d+/i.test(parsed.pathname);

  if (!isScribdHost || !isHttp || parsed.username || parsed.password || parsed.port || !isDocumentPath) {
    return { error: 'Pega un enlace de documento válido de scribd.com.' };
  }

  parsed.protocol = 'https:';
  return { url: parsed.href };
}

function resetDocument() {
  currentDocument = null;
  documentPanel.hidden = true;
  formatSection.hidden = true;
  downloadBtn.disabled = true;
  thumbEl.hidden = true;
  thumbEl.removeAttribute('src');
  titleEl.textContent = '';
  pagesEl.textContent = '';
  sourceFormatsEl.textContent = '';
  availabilityEl.textContent = '';
  sourceLink.removeAttribute('href');
  clearDetail();
}

function resetIfUrlChanged() {
  if (!currentDocument) return;
  if (urlInput.value.trim() === currentDocument.inputValue) return;
  resetDocument();
  setStatus('idle', 'Listo para analizar');
  statusDetail.append(
    Object.assign(document.createElement('p'), {
      textContent: 'Pega una URL y pulsa Analizar para comenzar'
    })
  );
}

/* ------------------------------------------------------------------ *
 * Análisis del documento
 * ------------------------------------------------------------------ */

async function inspectDocument() {
  if (isBusy) return;

  const normalized = normalizeInputUrl(urlInput.value);
  if (normalized.error) {
    setStatus('error', normalized.error);
    showErrorDetail(normalized.error);
    return;
  }

  resetDocument();
  setBusy(true);
  setStatus('info', 'Analizando documento...');
  clearDetail();
  statusDetail.append(
    Object.assign(document.createElement('p'), {
      textContent: 'Consultando la vista pública del documento en Scribd.'
    })
  );

  try {
    const response = await fetch(
      `/api/scribd/inspect?url=${encodeURIComponent(normalized.url)}`,
      { headers: { Accept: 'application/json' } }
    );

    const data = await readJson(response);

    if (!response.ok || !data.success) {
      const message = data.error || 'No se pudo analizar el documento.';
      setStatus('error', message);
      showErrorDetail(message);
      return;
    }

    currentDocument = {
      ...data.document,
      inputValue: urlInput.value.trim()
    };

    renderDocument(currentDocument);
  } catch (error) {
    const message = 'No se pudo contactar con el servidor.';
    setStatus('error', message);
    showErrorDetail(message);
    console.error('Error al analizar Scribd:', error);
  } finally {
    setBusy(false);
  }
}

function renderDocument(info) {
  titleEl.textContent = info.title || `Documento ${info.documentId}`;

  pagesEl.textContent = Number.isFinite(info.pageCount)
    ? String(info.pageCount)
    : 'No disponible';

  const formats = Array.isArray(info.formats) ? info.formats : [];
  sourceFormatsEl.textContent = formats.length
    ? formats.map((format) => SOURCE_FORMAT_NAMES[format] || String(format).toUpperCase()).join(', ')
    : 'No indicados';

  availabilityEl.textContent = info.downloadable
    ? 'Permitida por el autor'
    : 'No permitida por el autor';

  sourceLink.href = info.canonicalUrl || 'https://www.scribd.com/';
  sourceLink.textContent = 'Ver documento en Scribd';

  if (info.thumbnailUrl && /^https:\/\//i.test(info.thumbnailUrl)) {
    thumbEl.src = info.thumbnailUrl;
    thumbEl.alt = `Portada de ${titleEl.textContent}`;
    thumbEl.hidden = false;
  } else {
    thumbEl.hidden = true;
    thumbEl.removeAttribute('src');
  }

  documentPanel.hidden = false;
  formatSection.hidden = false;

  const tooManyPages = info.maxPages && info.pageCount > info.maxPages;

  if (!info.downloadable) {
    setStatus('warning', 'El autor no permite descargar este documento desde Scribd');
    showDetail([
      ['Título', titleEl.textContent],
      ['Páginas', pagesEl.textContent],
      ['Motivo', 'Scribd indica que la descarga no está permitida.']
    ]);
  } else if (tooManyPages) {
    setStatus('warning', `El documento supera el máximo de ${info.maxPages} páginas`);
    showDetail([
      ['Título', titleEl.textContent],
      ['Páginas', pagesEl.textContent],
      ['Máximo', String(info.maxPages)]
    ]);
  } else {
    setStatus('success', 'Documento listo para descargar');
    showDetail([
      ['Título', titleEl.textContent],
      ['Páginas', pagesEl.textContent]
    ]);
  }

  downloadBtn.disabled = !canDownload();
}

/* ------------------------------------------------------------------ *
 * Descarga del archivo
 * ------------------------------------------------------------------ */

async function downloadDocument() {
  if (isBusy || !currentDocument) return;

  if (!canDownload()) {
    setStatus('warning', 'Este documento no se puede descargar.');
    return;
  }

  const selected = document.querySelector('input[name="scribd-format"]:checked');
  const format = selected ? selected.value : 'pdf';

  setBusy(true);
  setStatus('info', 'Generando archivo...');
  clearDetail();
  statusDetail.append(
    Object.assign(document.createElement('p'), {
      textContent: `Preparando ${FORMAT_NAMES[format] || format}. Puede tardar unos segundos.`
    })
  );

  try {
    const response = await fetch('/api/scribd/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: currentDocument.inputValue, format })
    });

    const data = await readJson(response);

    if (!response.ok || !data.success) {
      const message = data.error || 'No se pudo generar el archivo.';
      setStatus('error', message);
      showErrorDetail(message);
      return;
    }

    setStatus('success', 'Descarga lista');
    showDetail([
      ['Título', data.title],
      ['Formato', FORMAT_NAMES[data.format] || data.format],
      ['Páginas incluidas', `${data.pageCount} de ${data.totalPages}`]
    ]);
    showWarnings(data.warnings);

    if (!data.downloadUrl) {
      showErrorDetail('El servidor no devolvió un enlace de descarga.');
      return;
    }

    const link = document.createElement('a');
    link.className = 'btn btn-primary scribd-result-link';
    link.href = data.downloadUrl;
    link.textContent = 'Descargar archivo';
    link.setAttribute('download', '');
    statusDetail.append(link);
    link.click();
  } catch (error) {
    const message = 'No se pudo contactar con el servidor.';
    setStatus('error', message);
    showErrorDetail(message);
    console.error('Error al descargar de Scribd:', error);
  } finally {
    setBusy(false);
  }
}

/* ------------------------------------------------------------------ *
 * Eventos
 * ------------------------------------------------------------------ */

form.addEventListener('submit', (event) => {
  event.preventDefault();
  inspectDocument();
});

downloadBtn.addEventListener('click', downloadDocument);
urlInput.addEventListener('input', resetIfUrlChanged);
