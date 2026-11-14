const {
  buildGoogleUrl,
  buildSearchQuery,
  parseGoogleSearchItems,
} = window.SlideDownloaderSearchUtils;

const FORMAT_ORDER = ['pptx', 'ppt', 'pdf'];
const DEFAULT_FORMATS = [...FORMAT_ORDER];
const MIN_TOPIC_LENGTH = 2;

const topicInput = document.getElementById('topic-input');
const searchBtn = document.getElementById('search-btn');
const formatChips = [...document.querySelectorAll('#format-chips .chip')];
const topicChips = [...document.querySelectorAll('#topic-chips .chip')];
const searchNote = document.getElementById('search-note');
const resultsHead = document.getElementById('results-head');
const resultsSummary = document.getElementById('results-summary');
const resultsState = document.getElementById('results-state');
const resultsGrid = document.getElementById('results-grid');
const googleLink = document.getElementById('google-link');
const googleSearchHost = document.getElementById('google-search-element');

const state = {
  topic: '',
  formats: [...DEFAULT_FORMATS],
  results: [],
  googleUrl: '',
  lastPayload: null,
  loading: false,
  requestId: 0,
  requestTimer: null,
};

let noteTimer = null;
let googleSearchElement = null;
let googleSearchPromise = null;
const pendingSearches = new Map();

function cleanTopic(value) {
  return String(value || '')
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function handleGoogleResults(_name, query, _promos, items) {
  const search = pendingSearches.get(String(query || ''));
  if (!search || search.requestId !== state.requestId) return true;

  pendingSearches.delete(String(query));
  clearTimeout(state.requestTimer);
  state.requestTimer = null;

  const payload = {
    topic: search.topic,
    formats: search.formats,
    results: parseGoogleSearchItems(items, search.formats),
    googleUrl: buildGoogleUrl(search.topic, search.formats),
  };

  state.results = payload.results;
  state.googleUrl = payload.googleUrl;
  state.lastPayload = payload;
  state.loading = false;
  renderResults(payload);

  return true;
}

async function initializeGoogleSearch() {
  const response = await fetch('/api/search/config', {
    headers: { accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.success || !payload.engineId) {
    throw new Error(payload.error || 'No se pudo cargar la configuración de búsqueda de Google.');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      fail(new Error('Google no inicializó el buscador. Intenta de nuevo.'));
    }, 20000);

    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    }

    function renderSearchElement() {
      if (settled) return;

      try {
        window.google.search.cse.element.render({
          div: googleSearchHost,
          tag: 'searchresults-only',
          gname: 'slidedownloader-results',
          attributes: {
            autoSearchOnLoad: false,
            resultSetSize: '10',
          },
        });
        googleSearchElement = window.google.search.cse.element.getElement('slidedownloader-results');
        if (!googleSearchElement) {
          throw new Error('Google no creó el componente de búsqueda.');
        }

        settled = true;
        clearTimeout(timeout);
        resolve(googleSearchElement);
      } catch (error) {
        fail(error);
      }
    }

    window.__gcse = {
      ...window.__gcse,
      parsetags: 'explicit',
      initializationCallback: renderSearchElement,
      searchCallbacks: {
        web: { ready: handleGoogleResults },
      },
    };

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://cse.google.com/cse.js?cx=${encodeURIComponent(payload.engineId)}`;
    script.onerror = () => fail(new Error('No se pudo cargar el buscador oficial de Google.'));
    document.head.append(script);
  });
}

function getGoogleSearchElement() {
  if (!googleSearchPromise) {
    googleSearchPromise = initializeGoogleSearch().catch((error) => {
      googleSearchPromise = null;
      throw error;
    });
  }

  return googleSearchPromise;
}

function createIcon(name, className = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');

  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${name}`);
  svg.append(use);

  return svg;
}

function formatLabel(format) {
  return String(format || '').toUpperCase();
}

function downloadUrlFor(url) {
  return `/api/file?url=${encodeURIComponent(url)}`;
}

function previewPageUrlFor(item) {
  const params = new URLSearchParams({
    url: item.url,
    title: item.title,
    format: item.format,
    fileName: item.fileName || '',
  });
  return `/preview?${params}`;
}

function showNote(message, tone = 'info') {
  clearTimeout(noteTimer);
  searchNote.textContent = message;
  searchNote.dataset.tone = tone;
  searchNote.hidden = false;

  noteTimer = setTimeout(() => {
    searchNote.hidden = true;
  }, 4200);
}

function syncUrl(topic = state.topic) {
  const params = new URLSearchParams();

  if (topic) params.set('tema', topic);
  if (state.formats.join(',') !== DEFAULT_FORMATS.join(',')) {
    params.set('formato', state.formats.join(','));
  }

  const query = params.toString();
  history.replaceState(null, '', query ? `${location.pathname}?${query}` : location.pathname);
}

function refreshFormatChips() {
  for (const chip of formatChips) {
    const active = state.formats.includes(chip.dataset.format);
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-pressed', String(active));
  }
}

function setGoogleLink(url) {
  if (url) {
    googleLink.href = url;
  } else {
    googleLink.href = buildGoogleUrl(state.topic, state.formats);
  }
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function createStateAction({ label, href, icon, variant = 'primary', onClick }) {
  const element = href ? document.createElement('a') : document.createElement('button');

  element.className = `btn btn-sm ${variant === 'primary' ? 'btn-primary' : 'btn-ghost'}`;
  if (href) {
    element.href = href;
    element.target = '_blank';
    element.rel = 'noopener noreferrer';
  } else {
    element.type = 'button';
    if (onClick) element.addEventListener('click', onClick);
  }

  if (icon) element.append(createIcon(icon));
  element.append(document.createTextNode(label));

  return element;
}

function renderState({ icon = 'i-search', title, text, actions = [], tone = 'neutral' }) {
  clearNode(resultsState);
  resultsState.hidden = false;
  resultsState.dataset.tone = tone;

  const iconWrap = document.createElement('span');
  iconWrap.className = 'results-state-icon';
  iconWrap.setAttribute('aria-hidden', 'true');
  iconWrap.append(createIcon(icon));
  resultsState.append(iconWrap);

  const heading = document.createElement('h3');
  heading.textContent = title;
  resultsState.append(heading);

  if (text) {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    resultsState.append(paragraph);
  }

  if (actions.length) {
    const actionRow = document.createElement('div');
    actionRow.className = 'results-state-actions';
    actionRow.append(...actions);
    resultsState.append(actionRow);
  }
}

function renderInitialState() {
  resultsGrid.hidden = true;
  clearNode(resultsGrid);
  resultsSummary.textContent = 'Escribe un tema para ver presentaciones.';
  setGoogleLink('');
  renderState({
    icon: 'i-search',
    title: 'Busca un tema para empezar',
    text: 'Verás archivos reales con vista previa, enlace directo y botón de descarga.',
  });
}

function renderSkeletons() {
  resultsState.hidden = true;
  resultsGrid.hidden = false;
  clearNode(resultsGrid);

  for (let index = 0; index < 6; index += 1) {
    const card = document.createElement('article');
    card.className = 'result-card result-card--skeleton';
    card.setAttribute('aria-hidden', 'true');

    const preview = document.createElement('div');
    preview.className = 'result-preview skeleton-block';

    const body = document.createElement('div');
    body.className = 'result-body';

    for (const width of ['38%', '82%', '64%', '48%']) {
      const line = document.createElement('span');
      line.className = 'skeleton-line';
      line.style.width = width;
      body.append(line);
    }

    card.append(preview, body);
    resultsGrid.append(card);
  }
}

function createResultCard(item, index) {
  const card = document.createElement('article');
  card.className = 'result-card';

  const previewButton = document.createElement('a');
  previewButton.className = `result-preview result-preview--${item.format}`;
  previewButton.href = previewPageUrlFor(item);
  previewButton.target = '_blank';
  previewButton.rel = 'noopener noreferrer';

  const rank = document.createElement('span');
  rank.className = 'result-rank';
  rank.textContent = String(index + 1).padStart(2, '0');

  const fileIcon = document.createElement('span');
  fileIcon.className = 'result-preview-file';
  fileIcon.append(createIcon(`i-${item.format === 'pdf' ? 'pdf' : 'pptx'}`, 'format-svg'));

  const extension = document.createElement('span');
  extension.className = 'result-preview-ext';
  extension.textContent = formatLabel(item.format);

  const previewCta = document.createElement('span');
  previewCta.className = 'result-preview-cta';
  previewCta.append(createIcon('i-eye'));
  previewCta.append(document.createTextNode('Vista previa'));

  const accessibleTitle = document.createElement('span');
  accessibleTitle.className = 'sr-only';
  accessibleTitle.textContent = `: ${item.title}`;

  previewButton.append(rank, fileIcon, extension, previewCta, accessibleTitle);

  const body = document.createElement('div');
  body.className = 'result-body';

  const meta = document.createElement('div');
  meta.className = 'result-meta';

  const domain = document.createElement('span');
  domain.className = 'result-domain';
  domain.textContent = item.domain;
  domain.title = item.domain;

  const badge = document.createElement('span');
  badge.className = `format-badge format-badge--${item.format}`;
  badge.textContent = formatLabel(item.format);

  meta.append(domain, badge);

  const title = document.createElement('h3');
  title.className = 'result-title';
  title.textContent = item.title;
  title.title = item.title;

  const pathLine = document.createElement('p');
  pathLine.className = 'result-path';
  pathLine.textContent = item.path;
  pathLine.title = item.url;

  body.append(meta, title, pathLine);

  if (item.snippet) {
    const snippet = document.createElement('p');
    snippet.className = 'result-snippet';
    snippet.textContent = item.snippet;
    body.append(snippet);
  }

  const actions = document.createElement('div');
  actions.className = 'result-actions';

  const viewLink = document.createElement('a');
  viewLink.className = 'btn btn-sm btn-ghost';
  viewLink.href = previewPageUrlFor(item);
  viewLink.target = '_blank';
  viewLink.rel = 'noopener noreferrer';
  viewLink.append(createIcon('i-external'));
  viewLink.append(document.createTextNode('Ver'));

  const downloadLink = document.createElement('a');
  downloadLink.className = 'btn btn-sm btn-primary';
  downloadLink.href = downloadUrlFor(item.url);
  downloadLink.setAttribute('download', item.fileName || '');
  downloadLink.append(createIcon('i-download'));
  downloadLink.append(document.createTextNode('Descargar'));
  downloadLink.addEventListener('click', () => {
    showNote(`Iniciando descarga de ${item.fileName || item.title}`);
  });

  actions.append(viewLink, downloadLink);
  body.append(actions);
  card.append(previewButton, body);

  return card;
}

function renderResults(payload) {
  const results = Array.isArray(payload.results) ? payload.results : [];

  resultsState.hidden = true;
  clearNode(resultsGrid);
  clearNode(resultsState);

  if (!results.length) {
    resultsGrid.hidden = true;
    resultsSummary.textContent = `Sin archivos para «${payload.topic}».`;
    setGoogleLink(payload.googleUrl);
    renderState({
      icon: 'i-alert',
      tone: 'empty',
      title: `No encontramos archivos para «${payload.topic}»`,
      text: 'Prueba con otras palabras o activa más formatos. Si esperabas resultados, revisa que el motor de Google tenga configurados sitios relevantes para el tema. También puedes continuar la búsqueda directamente en Google.',
      actions: [
        createStateAction({ label: 'Abrir búsqueda en Google', href: payload.googleUrl, icon: 'i-external' }),
        createStateAction({
          label: 'Probar con otro tema',
          icon: 'i-search',
          variant: 'ghost',
          onClick: () => {
            topicInput.value = '';
            topicInput.focus();
          },
        }),
      ],
    });
    return;
  }

  const counts = results.reduce((accumulator, item) => {
    accumulator[item.format] = (accumulator[item.format] || 0) + 1;
    return accumulator;
  }, {});

  const countText = FORMAT_ORDER
    .filter((format) => counts[format])
    .map((format) => `${counts[format]} ${formatLabel(format)}`)
    .join(' · ');

  resultsSummary.textContent = `${results.length} ${results.length === 1 ? 'archivo' : 'archivos'} para «${payload.topic}» · ${countText}`;
  setGoogleLink(payload.googleUrl);
  resultsGrid.hidden = false;

  const fragment = document.createDocumentFragment();
  results.forEach((item, index) => fragment.append(createResultCard(item, index)));
  resultsGrid.append(fragment);

  if (payload.partial) {
    showNote('Algunos formatos no respondieron. Los resultados disponibles ya aparecen abajo.', 'warning');
  }
}

function renderError(topic, message, googleUrl) {
  resultsGrid.hidden = true;
  clearNode(resultsGrid);
  resultsSummary.textContent = `No se pudo buscar «${topic}».`;
  setGoogleLink(googleUrl);
  renderState({
    icon: 'i-alert',
    tone: 'error',
    title: 'No pudimos completar la búsqueda',
    text: message || 'Revisa tu conexión e inténtalo de nuevo.',
    actions: [
      createStateAction({
        label: 'Reintentar',
        icon: 'i-refresh',
        onClick: () => runSearch(),
      }),
      createStateAction({ label: 'Buscar en Google', href: googleUrl, icon: 'i-external', variant: 'ghost' }),
    ],
  });
}

async function runSearch() {
  const topic = cleanTopic(topicInput.value);

  if (topic.length < MIN_TOPIC_LENGTH) {
    showNote('Escribe un tema de al menos 2 caracteres.', 'warning');
    topicInput.focus();
    return;
  }

  if (!state.formats.length) {
    state.formats = [...DEFAULT_FORMATS];
    refreshFormatChips();
  }

  state.topic = topic;
  state.loading = true;
  state.requestId += 1;
  const requestId = state.requestId;
  const formats = [...state.formats];
  const query = buildSearchQuery(topic, formats);

  clearTimeout(state.requestTimer);
  state.requestTimer = null;
  pendingSearches.clear();

  syncUrl(topic);
  state.googleUrl = buildGoogleUrl(topic, formats);
  resultsSummary.textContent = `Buscando archivos para «${topic}»…`;
  resultsHead.hidden = false;
  renderSkeletons();

  try {
    const searchElement = await getGoogleSearchElement();
    if (requestId !== state.requestId) return;

    pendingSearches.set(query, { topic, formats, requestId });
    state.requestTimer = setTimeout(() => {
      if (requestId !== state.requestId) return;
      pendingSearches.delete(query);
      state.loading = false;
      renderError(topic, 'Google tardó demasiado en responder. Intenta de nuevo.', state.googleUrl);
    }, 30000);
    searchElement.execute(query);
  } catch (error) {
    if (requestId !== state.requestId) return;

    state.results = [];
    state.loading = false;
    renderError(topic, error.message, state.googleUrl);
  }
}

function toggleFormat(format) {
  if (state.formats.includes(format)) {
    if (state.formats.length === 1) {
      showNote('Deja al menos un formato activo.', 'warning');
      return;
    }
    state.formats = state.formats.filter((value) => value !== format);
  } else {
    state.formats = FORMAT_ORDER.filter((value) => state.formats.includes(value) || value === format);
  }

  refreshFormatChips();
  setGoogleLink('');
  syncUrl();

  if (state.topic && cleanTopic(topicInput.value) === state.topic) {
    runSearch();
  }
}

function restoreFromUrl() {
  const params = new URLSearchParams(location.search);
  const topic = cleanTopic(params.get('tema'));

  const formats = String(params.get('formato') || '')
    .split(',')
    .map((value) => value.trim().toLowerCase().replace(/^\./, ''))
    .filter((value) => FORMAT_ORDER.includes(value));

  if (formats.length) state.formats = [...new Set(formats)];
  if (topic) topicInput.value = topic;

  refreshFormatChips();
  setGoogleLink('');
  return topic;
}

topicInput.addEventListener('input', () => {
  if (!cleanTopic(topicInput.value)) {
    state.topic = '';
    state.requestId += 1;
    state.loading = false;
    pendingSearches.clear();
    clearTimeout(state.requestTimer);
    state.requestTimer = null;
    renderInitialState();
  }
});

topicInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    runSearch();
  }
});

searchBtn.addEventListener('click', () => runSearch());

for (const chip of formatChips) {
  chip.addEventListener('click', () => toggleFormat(chip.dataset.format));
}

for (const chip of topicChips) {
  chip.addEventListener('click', () => {
    topicInput.value = chip.dataset.topic;
    runSearch();
  });
}

const initialTopic = restoreFromUrl();

if (initialTopic) {
  runSearch();
} else {
  renderInitialState();
}
