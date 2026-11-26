// ============================================================
// SlideDownloader · Asistente de Presentaciones IA
// ============================================================

const urlInput = document.getElementById('ai-url');
const detectBtn = document.getElementById('ai-detect');
const generateBtn = document.getElementById('ai-generate');
const copyBtn = document.getElementById('ai-copy');
const regenerateBtn = document.getElementById('ai-regenerate');
const galleryBtn = document.getElementById('ai-gallery-btn');
const galleryBack = document.getElementById('gallery-back');

const viewAnalyzer = document.getElementById('view-analyzer');
const viewGallery = document.getElementById('view-gallery');

const resultPanel = document.getElementById('ai-result');
const optionsPanel = document.getElementById('ai-options');
const promptContainer = document.getElementById('ai-prompt-container');
const promptOutput = document.getElementById('prompt-output');
const promptChars = document.getElementById('prompt-chars');

const summaryContainer = document.getElementById('ai-summary-container');
const summaryTopic = document.getElementById('summary-topic');
const summaryOverview = document.getElementById('summary-overview');
const summaryConfidence = document.getElementById('summary-confidence');
const summaryPoints = document.getElementById('summary-points');
const summaryOutline = document.getElementById('summary-outline');
const summaryLimitations = document.getElementById('summary-limitations');
const summaryOutput = document.getElementById('summary-output');
const summaryCopyBtn = document.getElementById('summary-copy');
const summaryCopyLabel = document.getElementById('summary-copy-label');

const CONFIDENCE_LABELS = { alta: 'Alta', media: 'Media', baja: 'Baja' };

const statTitle = document.getElementById('stat-title');
const statSlides = document.getElementById('stat-slides');
const statAuthor = document.getElementById('stat-author');
const statDescription = document.getElementById('stat-description');
const statKeywords = document.getElementById('stat-keywords');

const galleryGrid = document.getElementById('gallery-grid');
const galleryStats = document.getElementById('gallery-stats');
const statTotal = document.getElementById('stat-total');
const statShowing = document.getElementById('stat-showing');
const galleryEmpty = document.getElementById('gallery-empty');

// Estado de la aplicación
let currentAnalysis = null;
let currentGallery = [];
let selectedFormat = 'pptx';
let analyzedInputValue = '';

/* ============================================================
   Navegación entre vistas
   ============================================================ */

const navButtons = document.querySelectorAll('.nav-btn');

function showView(viewName) {
  navButtons.forEach((btn) => {
    const active = btn.dataset.view === viewName;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active);
  });

  const views = document.querySelectorAll('.view');
  views.forEach((view) => {
    const active = view.id === `view-${viewName}`;
    view.classList.toggle('view--active', active);
    view.hidden = !active;
  });
}

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    showView(btn.dataset.view);
  });
});

galleryBack.addEventListener('click', () => {
  showView('analyzer');
});

galleryBtn.addEventListener('click', () => {
  if (!currentAnalysis || !currentAnalysis.galleryImages?.length) return;
  showView('gallery');
  renderGallery(currentGallery);
});

/* ============================================================
   Utilidades de UI
   ============================================================ */

async function readJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: `Respuesta no válida del servidor (HTTP ${response.status})`
    };
  }
}

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

function showStatus(element, type, message) {
  element.textContent = message;
  element.className = 'status-text ' + type;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderKeywords(keywords) {
  if (!keywords || !keywords.length) {
    statKeywords.innerHTML = '<span style="color:#94a3b8;font-size:12px">Sin conceptos detectados</span>';
    return;
  }
  statKeywords.innerHTML = keywords
    .map((k) => `<span class="keyword">${escapeHtml(k)}</span>`)
    .join('');
}

/* ============================================================
   Chips de opciones
   ============================================================ */

function bindChipGroup(groupId, dataAttr) {
  const group = document.getElementById(groupId);
  if (!group) return;

  group.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;

    const chips = group.querySelectorAll('.chip');
    chips.forEach((c) => {
      c.classList.toggle('active', c === chip);
    });
  });
}

bindChipGroup('chip-goal', 'goal');
bindChipGroup('chip-tone', 'tone');
bindChipGroup('chip-style', 'style');
bindChipGroup('chip-palette', 'palette');
bindChipGroup('chip-slides', 'slides');
bindChipGroup('chip-language', 'language');

function getSelectedOptions() {
  const read = (groupId, dataAttr) => {
    const active = document.querySelector(`#${groupId} .chip.active`);
    return active ? active.dataset[dataAttr] : null;
  };

  const goal = read('chip-goal', 'goal');
  const tone = read('chip-tone', 'tone');
  const style = read('chip-style', 'style');
  const palette = read('chip-palette', 'palette');
  const slides = read('chip-slides', 'slides');
  const language = read('chip-language', 'language');

  return {
    goal,
    tone,
    style,
    palette,
    slides: slides ? Number(slides) : 12,
    language,
    audience: '',
    brand: '',
    notes: document.getElementById('opt-notes-text')?.value || '',
    includeImages: document.getElementById('opt-images')?.checked !== false,
    speakerNotes: document.getElementById('opt-notes')?.checked !== false
  };
}

/* ============================================================
   Análisis de presentación
   ============================================================ */

async function handleAnalyze() {
  const url = urlInput.value.trim();
  const status = document.getElementById('ai-status');

  if (!url) {
    showStatus(status, 'error', 'Pega el enlace de una presentación para continuar.');
    return;
  }

  if (!isSlideShareUrl(url)) {
    showStatus(status, 'error', 'El enlace debe pertenecer a slideshare.net.');
    return;
  }

  currentAnalysis = null;
  currentGallery = [];
  analyzedInputValue = '';
  resultPanel.hidden = true;
  optionsPanel.hidden = true;
  promptContainer.hidden = true;
  document.getElementById('ai-manual-entry').hidden = true;

  detectBtn.disabled = true;
  urlInput.disabled = true;
  const originalText = detectBtn.innerHTML;
  detectBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg> Analizando…';
  detectBtn.classList.add('btn-loading');
  showStatus(status, 'info', 'Buscando la información pública de la presentación…');

  try {
    const response = await fetch('/api/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await readJson(response);

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'No se pudo analizar la presentación');
    }

    currentAnalysis = {
      url: data.url,
      title: data.title || 'Presentación sin título',
      description: data.description || '',
      author: data.author || '',
      slideCount: data.slideCount || 0,
      keywords: data.keywords || [],
      galleryImages: data.galleryImages || data.previewImages || [],
      previewImages: data.previewImages || [],
      challengeDetected: data.challengeDetected || false
    };
    currentGallery = currentAnalysis.galleryImages;
    analyzedInputValue = url;

    statTitle.textContent = currentAnalysis.title;
    statSlides.textContent = currentAnalysis.slideCount || '—';
    statAuthor.textContent = currentAnalysis.author || '—';
    statDescription.textContent = currentAnalysis.description || 'No hay descripción disponible';
    renderKeywords(currentAnalysis.keywords || []);

    resultPanel.hidden = false;
    optionsPanel.hidden = false;

    // Mostrar entrada manual si el servidor indica que se necesita (sin imágenes y sin renderizador)
    const manualEntry = document.getElementById('ai-manual-entry');
    if (data.needsManualEntry) {
      manualEntry.hidden = false;
      // Precargar campos manuales con los datos que se pudieron obtener
      document.getElementById('manual-title').value = currentAnalysis.title;
      document.getElementById('manual-description').value = currentAnalysis.description;
      document.getElementById('manual-author').value = currentAnalysis.author;
      document.getElementById('manual-slides').value = currentAnalysis.slideCount || 12;
      showStatus(status, 'warning', 'El análisis encontró información parcial. Completa los datos que falten para mejorar el prompt.');
    } else {
      manualEntry.hidden = true;
      if (currentAnalysis.challengeDetected) {
        showStatus(status, 'warning', 'SlideShare limitó el acceso; la información detectada podría estar incompleta.');
      } else {
        showStatus(status, 'success', 'Presentación analizada. Revisa los datos y genera tu prompt.');
      }
    }
  } catch (error) {
    showStatus(status, 'error', error.message || 'No se pudo analizar la presentación.');
    console.error('Analyze error:', error);
  } finally {
    detectBtn.disabled = false;
    urlInput.disabled = false;
    detectBtn.innerHTML = originalText;
    detectBtn.classList.remove('btn-loading');
  }
}

detectBtn.addEventListener('click', handleAnalyze);

urlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    handleAnalyze();
  }
});

urlInput.addEventListener('input', () => {
  if (currentAnalysis && urlInput.value.trim() !== analyzedInputValue) {
    currentAnalysis = null;
    currentGallery = [];
    resultPanel.hidden = true;
    optionsPanel.hidden = true;
    promptContainer.hidden = true;
    summaryContainer.hidden = true;
    document.getElementById('ai-manual-entry').hidden = true;
    showStatus(document.getElementById('ai-status'), 'info', 'Enlace modificado. Analízalo para generar un prompt con sus datos.');
  }
});

/* ============================================================
   Resumen estructurado
   ============================================================ */

function fillSummaryList(container, values) {
  container.textContent = '';

  const items = Array.isArray(values) ? values : [];
  if (!items.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Sin datos disponibles.';
    container.appendChild(empty);
    return;
  }

  for (const value of items) {
    const item = document.createElement('li');
    item.textContent = String(value);
    container.appendChild(item);
  }
}

function renderSummary(summary) {
  if (!summary) {
    summaryContainer.hidden = true;
    return;
  }

  const topic = String(summary.topic || 'Tema no determinado');
  const confidence = CONFIDENCE_LABELS[summary.topicConfidence] || 'Baja';
  const points = Array.isArray(summary.keyPoints) ? summary.keyPoints : [];
  const outline = Array.isArray(summary.suggestedOutline) ? summary.suggestedOutline : [];
  const limitations = Array.isArray(summary.limitations) ? summary.limitations : [];

  summaryTopic.textContent = topic;
  summaryOverview.textContent = String(summary.overview || '');
  summaryConfidence.textContent = `Confianza: ${confidence}`;
  fillSummaryList(summaryPoints, points);
  fillSummaryList(summaryOutline, outline);
  fillSummaryList(summaryLimitations, limitations);

  const lines = [
    `Tema principal: ${topic}`,
    `Confianza: ${confidence}`,
    '',
    String(summary.overview || ''),
    '',
    'Puntos clave',
    ...points.map((point) => `- ${String(point)}`),
    '',
    'Estructura sugerida',
    ...outline.map((item) => `- ${String(item)}`)
  ];

  if (limitations.length) {
    lines.push('', 'Limitaciones', ...limitations.map((item) => `- ${String(item)}`));
  }

  summaryOutput.textContent = lines.join('\n').trim();
  summaryContainer.hidden = false;
}

summaryCopyBtn.addEventListener('click', async () => {
  const text = summaryOutput.textContent;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    summaryCopyLabel.textContent = '¡Copiado!';
    setTimeout(() => {
      summaryCopyLabel.textContent = 'Copiar resumen';
    }, 1800);
  } catch (error) {
    showStatus(document.getElementById('ai-status'), 'error', 'No se pudo copiar el resumen');
  }
});

/* ============================================================
   Generación de prompt
   ============================================================ */

async function handleGeneratePrompt() {
  const manualEntry = document.getElementById('ai-manual-entry');
  const usingManual = manualEntry && !manualEntry.hidden;

  // Construir análisis desde entrada manual si corresponde
  let analysisPayload = currentAnalysis;
  if (usingManual) {
    const title = document.getElementById('manual-title').value.trim();
    const description = document.getElementById('manual-description').value.trim();
    const author = document.getElementById('manual-author').value.trim();
    const slides = parseInt(document.getElementById('manual-slides').value, 10) || 12;

    if (!title) {
      showStatus(document.getElementById('ai-status'), 'error', 'Ingresa un título para continuar');
      return;
    }

    analysisPayload = {
      url: currentAnalysis.url || '',
      title,
      description,
      author,
      slideCount: slides,
      imageUrls: [], // sin imágenes en entrada manual
      keywords: [],
      challengeDetected: false,
      method: 'manual'
    };
  }

  if (!analysisPayload) {
    showStatus(document.getElementById('ai-status'), 'error', 'Analiza una presentación primero');
    return;
  }

  const options = getSelectedOptions();

  generateBtn.disabled = true;
  const originalText = generateBtn.innerHTML;
  generateBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg> Generando…';
  generateBtn.classList.add('btn-loading');

  try {
    const response = await fetch('/api/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: analysisPayload.url,
        analysis: analysisPayload,
        options
      })
    });

    const data = await readJson(response);

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'No se pudo generar el prompt');
    }

    promptOutput.textContent = data.prompt;
    promptChars.textContent = `${data.characterCount.toLocaleString()} caracteres`;
    promptContainer.hidden = false;
    renderSummary(data.summary);

    showStatus(document.getElementById('ai-status'), 'success', 'Prompt y resumen listos para copiar.');
  } catch (error) {
    showStatus(document.getElementById('ai-status'), 'error', error.message || 'Error generando el prompt');
    console.error('Prompt error:', error);
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = originalText;
    generateBtn.classList.remove('btn-loading');
  }
}

generateBtn.addEventListener('click', handleGeneratePrompt);

copyBtn.addEventListener('click', async () => {
  const text = promptOutput.textContent;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    const original = copyBtn.innerHTML;
    copyBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-star"/></svg> ¡Copiado!';
    copyBtn.classList.add('btn-success');
    setTimeout(() => {
      copyBtn.innerHTML = original;
      copyBtn.classList.remove('btn-success');
    }, 1800);
  } catch (error) {
    // Fallback para navegadores antiguos
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      copyBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-star"/></svg> ¡Copiado!';
      copyBtn.classList.add('btn-success');
      setTimeout(() => {
        copyBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-copy"/></svg> Copiar prompt';
        copyBtn.classList.remove('btn-success');
      }, 1800);
    } catch (err) {
      showStatus(document.getElementById('ai-status'), 'error', 'No se pudo copiar al portapapeles');
    } finally {
      document.body.removeChild(textarea);
    }
  }
});

regenerateBtn.addEventListener('click', () => {
  promptOutput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  promptOutput.classList.add('prompt-flash');
  setTimeout(() => promptOutput.classList.remove('prompt-flash'), 400);
});

/* ============================================================
   Galería de diapositivas
   ============================================================ */

function renderGallery(images) {
  galleryGrid.textContent = '';

  if (!images || !images.length) {
    galleryStats.hidden = true;
    galleryEmpty.hidden = false;
    return;
  }

  galleryStats.hidden = false;
  galleryEmpty.hidden = true;
  statTotal.textContent = images.length;
  statShowing.textContent = Math.min(images.length, 24);

  const visible = images.slice(0, 24);

  visible.forEach((src, index) => {
    const figure = document.createElement('figure');
    figure.className = 'gallery-item';

    const image = document.createElement('img');
    image.src = src;
    image.alt = `Diapositiva ${index + 1}`;
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      image.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%23cbd5e1" d="M3 4h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path fill="%2394a3b8" d="M9 14h6v-2H9zM9 19h6v-2H9z"/></svg>';
    });

    figure.appendChild(image);
    galleryGrid.appendChild(figure);
  });
}

/* ============================================================
   Inicialización
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Mostrar vista activa por defecto
  showView('analyzer');

  // Si hay una URL en el input al cargar, no hacer nada hasta que el usuario pulse Analizar
});
