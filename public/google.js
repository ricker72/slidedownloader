const FORMAT_ORDER = ['pptx', 'ppt', 'pdf'];
const DEFAULT_FORMATS = ['pptx', 'ppt'];
const EXCLUDED_SITES = [
  '-site:studocu.com',
  '-site:scribd.com',
  '-site:coursehero.com',
  '-site:docsity.com',
  '-site:brainly.com',
];

const SCOPES = {
  all: '',
  edu: '(site:.edu OR site:.edu.mx)',
  gob: 'site:.gob.mx',
};

const topicInput = document.getElementById('topic-input');
const searchBtn = document.getElementById('search-btn');
const copyBtn = document.getElementById('copy-btn');
const queryPreview = document.getElementById('query-preview');
const feedback = document.getElementById('query-feedback');
const formatChips = [...document.querySelectorAll('#format-chips .chip')];
const scopeChips = [...document.querySelectorAll('#scope-chips .chip')];
const topicChips = [...document.querySelectorAll('#topic-chips .chip')];
const exactToggle = document.getElementById('opt-exact');
const excludeToggle = document.getElementById('opt-exclude');
const shortcutCards = [...document.querySelectorAll('.shortcut-card')];

const state = {
  formats: [...DEFAULT_FORMATS],
  scope: 'all',
  exact: false,
  exclude: true,
};

let feedbackTimer = null;

/**
 * Normalizar el tema: sin espacios repetidos ni comillas sueltas.
 */
function cleanTopic(value) {
  return String(value || '')
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Construir la búsqueda de Google con los filtros activos.
 */
function buildQuery(topic) {
  const formats = FORMAT_ORDER.filter((format) => state.formats.includes(format));
  const typePart = formats.length === 1
    ? `filetype:${formats[0]}`
    : `(${formats.map((format) => `filetype:${format}`).join(' OR ')})`;

  const clean = cleanTopic(topic);
  const topicPart = clean ? (state.exact ? `"${clean}"` : clean) : '';
  const scopePart = SCOPES[state.scope] || '';
  const excludePart = state.exclude ? EXCLUDED_SITES.join(' ') : '';

  return [typePart, topicPart, scopePart, excludePart].filter(Boolean).join(' ');
}

/**
 * Pintar la búsqueda resaltando los operadores de Google.
 */
function renderQueryPreview(query, hasTopic) {
  queryPreview.textContent = '';

  const append = (text, className) => {
    if (!text) return;
    if (className) {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text;
      queryPreview.append(span);
      return;
    }
    queryPreview.append(document.createTextNode(text));
  };

  const tokens = query.split(' ');

  tokens.forEach((token, index) => {
    if (index > 0) append(' ');

    // Separar paréntesis/comas finales para que el resaltado no los incluya.
    const parts = token.match(/^(.*?)([),]*)$/);
    const core = parts ? parts[1] : token;
    const tail = parts ? parts[2] : '';

    if (core.startsWith('filetype:')) {
      append(core, 'query-token');
    } else if (core.startsWith('-site:')) {
      append(core, 'query-exclude');
    } else if (core.startsWith('site:') || core === 'OR') {
      append(core, 'query-scope');
    } else {
      append(core);
    }

    append(tail);
  });

  if (!hasTopic) {
    append(' tu tema', 'query-muted');
  }
}

/**
 * Sincronizar el estado con la barra de direcciones para poder compartirlo.
 */
function syncUrl(topic) {
  const params = new URLSearchParams();

  if (cleanTopic(topic)) params.set('tema', cleanTopic(topic));
  if (state.formats.join(',') !== DEFAULT_FORMATS.join(',')) {
    params.set('formato', state.formats.join(','));
  }
  if (state.scope !== 'all') params.set('ambito', state.scope);

  const query = params.toString();
  const nextUrl = query ? `${location.pathname}?${query}` : location.pathname;
  history.replaceState(null, '', nextUrl);
}

/**
 * Actualizar la vista previa y el estado visual de los filtros.
 */
function refresh() {
  const topic = cleanTopic(topicInput.value);
  const query = buildQuery(topic);

  renderQueryPreview(query, Boolean(topic));
  searchBtn.disabled = !topic;

  for (const chip of formatChips) {
    const active = state.formats.includes(chip.dataset.format);
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-pressed', String(active));
  }

  for (const chip of scopeChips) {
    const active = chip.dataset.scope === state.scope;
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-pressed', String(active));
  }

  syncUrl(topic);
}

/**
 * Mostrar un aviso breve bajo la búsqueda.
 */
function showFeedback(message) {
  clearTimeout(feedbackTimer);
  feedback.textContent = message;

  feedbackTimer = setTimeout(() => {
    feedback.textContent = '';
  }, 2600);
}

/**
 * Abrir Google con la búsqueda generada.
 */
function openSearch(topicOverride) {
  const topic = cleanTopic(topicOverride != null ? topicOverride : topicInput.value);

  if (!topic) {
    showFeedback('Escribe primero un tema');
    topicInput.focus();
    return;
  }

  const url = `https://www.google.com/search?q=${encodeURIComponent(buildQuery(topic))}&hl=es`;
  const win = window.open(url, '_blank', 'noopener,noreferrer');

  if (!win) {
    location.href = url;
  }
}

/**
 * Copiar la búsqueda al portapapeles.
 */
async function copyQuery() {
  const topic = cleanTopic(topicInput.value);

  if (!topic) {
    showFeedback('Escribe primero un tema');
    topicInput.focus();
    return;
  }

  const query = buildQuery(topic);

  try {
    await navigator.clipboard.writeText(query);
    showFeedback('Búsqueda copiada');
  } catch (error) {
    const helper = document.createElement('textarea');
    helper.value = query;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.append(helper);
    helper.select();

    try {
      document.execCommand('copy');
      showFeedback('Búsqueda copiada');
    } catch (copyError) {
      showFeedback('No se pudo copiar');
    }

    helper.remove();
  }
}

/**
 * Activar o desactivar un formato, sin permitir que quede ninguno.
 */
function toggleFormat(format) {
  if (state.formats.includes(format)) {
    if (state.formats.length === 1) {
      showFeedback('Deja al menos un formato activo');
      return;
    }
    state.formats = state.formats.filter((value) => value !== format);
  } else {
    state.formats.push(format);
  }

  refresh();
}

/**
 * Aplicar un formato único desde los atajos y buscar.
 */
function useShortcut(format) {
  state.formats = [format];
  refresh();

  if (cleanTopic(topicInput.value)) {
    openSearch();
  } else {
    showFeedback('Ahora escribe el tema y pulsa Buscar');
    topicInput.focus();
  }
}

/**
 * Leer los parámetros de la URL para restaurar una búsqueda compartida.
 */
function restoreFromUrl() {
  const params = new URLSearchParams(location.search);
  const topic = params.get('tema');
  const formats = (params.get('formato') || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => FORMAT_ORDER.includes(value));
  const scope = params.get('ambito');

  if (topic) topicInput.value = cleanTopic(topic);
  if (formats.length) state.formats = [...new Set(formats)];
  if (scope && SCOPES[scope] != null) state.scope = scope;
}

topicInput.addEventListener('input', refresh);

topicInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    openSearch();
  }
});

searchBtn.addEventListener('click', () => openSearch());
copyBtn.addEventListener('click', copyQuery);

for (const chip of formatChips) {
  chip.addEventListener('click', () => toggleFormat(chip.dataset.format));
}

for (const chip of scopeChips) {
  chip.addEventListener('click', () => {
    state.scope = chip.dataset.scope;
    refresh();
  });
}

for (const chip of topicChips) {
  chip.addEventListener('click', () => {
    topicInput.value = chip.dataset.topic;
    refresh();
    topicInput.focus();
  });
}

for (const card of shortcutCards) {
  card.addEventListener('click', () => useShortcut(card.dataset.shortcut));
}

exactToggle.addEventListener('change', () => {
  state.exact = exactToggle.checked;
  refresh();
});

excludeToggle.addEventListener('change', () => {
  state.exclude = excludeToggle.checked;
  refresh();
});

restoreFromUrl();
exactToggle.checked = state.exact;
excludeToggle.checked = state.exclude;
refresh();
