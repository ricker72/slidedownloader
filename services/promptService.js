/**
 * Generador de prompts para recrear una presentación con una identidad nueva.
 * No copia el contenido original: usa título, descripción, número de slides y
 * palabras clave como punto de partida para una reinterpretación.
 */

const LANGUAGE_NAMES = {
  es: 'español',
  en: 'inglés',
  pt: 'portugués'
};

const GOALS = {
  educativa: 'explicar el tema con claridad y que la audiencia lo recuerde',
  comercial: 'presentar una propuesta de valor y generar una decisión favorable',
  tecnica: 'documentar un proceso o solución técnica de forma comprensible',
  inspiracional: 'inspirar, conectar emocionalmente y movilizar a la acción',
  estrategica: 'alinear a las personas con una visión y unos próximos pasos concretos'
};

const TONES = {
  profesional: 'profesional, sobrio y seguro',
  cercano: 'cercano, conversacional y humano',
  directo: 'directo, breve y orientado a la acción',
  inspirador: 'inspirador, optimista y memorable'
};

const STYLES = {
  minimalista: {
    name: 'minimalista',
    direction: 'mucho espacio en blanco, una idea por diapositiva, líneas finas, iconografía simple y ausencia de decoración innecesaria',
    imagery: 'fotografía editorial limpia o ilustraciones vectoriales planas, siempre con fondos claros y un único punto focal'
  },
  corporativo: {
    name: 'corporativo moderno',
    direction: 'rejilla ordenada, tarjetas suaves, jerarquía tipográfica marcada, datos visuales y un acento de color institucional',
    imagery: 'fotografía corporativa auténtica y gráficos de datos limpios; evitar el aspecto de banco de imágenes genérico'
  },
  editorial: {
    name: 'editorial',
    direction: 'composición tipo revista, titulares grandes, contraste entre serif y sans-serif, imágenes a sangre y abundante aire',
    imagery: 'fotografía documental o bodegones conceptuales con luz natural y encuadres intencionados'
  },
  creativo: {
    name: 'creativo y expresivo',
    direction: 'formas orgánicas, tipografía de gran escala, color con personalidad y composiciones asimétricas controladas',
    imagery: 'ilustración contemporánea, collage digital o fotografía con dirección de arte atrevida'
  },
  tecnologico: {
    name: 'tecnológico claro',
    direction: 'fondo claro, acentos en degradado azul, etiquetas monoespaciadas, diagramas precisos y sensación de producto digital',
    imagery: 'renders 3D limpios, interfaces abstractas y visualizaciones de datos con profundidad sutil'
  }
};

const PALETTES = {
  claro: {
    name: 'claro y luminoso',
    colors: 'fondo blanco (#FFFFFF) y gris muy claro (#F8FAFC), texto principal casi negro (#0F172A), texto secundario (#475569), acento azul (#2563EB)',
    note: 'mantener fondos claros en al menos el 85 % de las diapositivas y garantizar contraste AA'
  },
  pastel: {
    name: 'pastel suave',
    colors: 'fondo crema (#FFFBF5), tarjetas lavanda (#EDE9FE), menta (#D1FAE5), melocotón (#FFEDD5) y texto grafito (#1F2937)',
    note: 'usar los pasteles como superficies, nunca como color de texto sobre blanco'
  },
  corporativo: {
    name: 'corporativo confiable',
    colors: 'fondo blanco (#FFFFFF), azul marino (#0F2A4A), gris pizarra (#334155), azul de acento (#1D4ED8) y un dorado puntual (#D4A017)',
    note: 'reservar el dorado para cifras o llamadas a la acción muy puntuales'
  },
  natural: {
    name: 'natural y sereno',
    colors: 'fondo hueso (#FAF7F0), verde salvia (#4D7C5A), arena (#E7DCC8), carbón (#1F2A24) y terracota (#C2703D)',
    note: 'evitar saturación alta; la calma visual debe transmitir credibilidad'
  }
};

const STOPWORDS = new Set([
  'a', 'al', 'algo', 'algunas', 'algunos', 'ante', 'antes', 'como', 'con', 'contra', 'cual', 'cuando',
  'de', 'del', 'desde', 'donde', 'dos', 'el', 'ella', 'ellas', 'ellos', 'en', 'entre', 'era', 'es', 'esa',
  'ese', 'eso', 'esta', 'este', 'esto', 'fue', 'ha', 'hacia', 'hasta', 'la', 'las', 'le', 'les', 'lo',
  'los', 'más', 'me', 'mi', 'mis', 'mucho', 'muy', 'no', 'nos', 'o', 'otra', 'otro', 'para', 'pero',
  'poco', 'por', 'porque', 'que', 'quien', 'se', 'sin', 'sobre', 'su', 'sus', 'también', 'te', 'tu',
  'tus', 'un', 'una', 'uno', 'unos', 'y', 'ya', 'the', 'and', 'for', 'with', 'from', 'that', 'this',
  'are', 'was', 'were', 'you', 'your', 'our', 'their', 'have', 'has', 'not', 'but', 'about', 'into',
  'slideshare', 'presentación', 'presentacion', 'presentation', 'slides', 'slide', 'diapositiva',
  'diapositivas', 'ppt', 'pptx', 'ppsx', 'potx', 'pdf', 'docx', 'powerpoint', 'documento', 'archivo',
  'descargar', 'descarga'
]);

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripDiacritics(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function cleanTitle(title) {
  const cleaned = normalizeWhitespace(title)
    .replace(/\s*[|·-]\s*slideshare.*$/i, '')
    .replace(/\s*slideshare\s*/gi, ' ')
    .trim();

  return cleaned || 'Presentación sin título';
}

function clampSlides(value, fallback = 12) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(30, Math.max(5, parsed));
}

/**
 * Palabras clave por frecuencia, con más peso para las que aparecen en el título.
 */
function extractKeywords(text, limit = 10) {
  const title = normalizeWhitespace(text.title);
  const body = normalizeWhitespace(text.description);

  const counts = new Map();
  const display = new Map();

  const add = (raw, weight) => {
    const word = normalizeWhitespace(raw).replace(/[^\p{L}\p{N}-]/gu, '');
    if (word.length < 3) return;

    const normalized = stripDiacritics(word.toLowerCase());
    if (STOPWORDS.has(normalized) || /^\d+$/.test(normalized)) return;

    counts.set(normalized, (counts.get(normalized) || 0) + weight);
    if (!display.has(normalized)) display.set(normalized, word.toLowerCase());
  };

  for (const word of title.split(/\s+/)) add(word, 3);
  for (const word of body.split(/\s+/)) add(word, 1);

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key]) => display.get(key));
}

function buildAnalysis(input = {}) {
  const title = cleanTitle(input.title);
  const description = normalizeWhitespace(input.description);
  const slideCount = Math.max(0, Number.parseInt(input.slideCount, 10) || 0);
  const keywords = extractKeywords({ title, description }, 10);

  return {
    title,
    description,
    author: normalizeWhitespace(input.author),
    sourceUrl: normalizeWhitespace(input.url),
    slideCount,
    topic: title,
    keywords,
    hasDescription: Boolean(description)
  };
}

function normalizeOptions(options = {}) {
  const goal = Object.prototype.hasOwnProperty.call(GOALS, options.goal) ? options.goal : 'educativa';
  const tone = Object.prototype.hasOwnProperty.call(TONES, options.tone) ? options.tone : 'profesional';
  const style = Object.prototype.hasOwnProperty.call(STYLES, options.style) ? options.style : 'minimalista';
  const palette = Object.prototype.hasOwnProperty.call(PALETTES, options.palette) ? options.palette : 'claro';
  const language = Object.prototype.hasOwnProperty.call(LANGUAGE_NAMES, options.language) ? options.language : 'es';

  return {
    goal,
    goalText: GOALS[goal],
    tone,
    toneText: TONES[tone],
    style: STYLES[style],
    palette: PALETTES[palette],
    language,
    languageName: LANGUAGE_NAMES[language],
    slides: clampSlides(options.slides, 12),
    audience: normalizeWhitespace(options.audience).slice(0, 180) || 'público general interesado en el tema',
    brand: normalizeWhitespace(options.brand).slice(0, 120),
    notes: normalizeWhitespace(options.notes).slice(0, 2500),
    includeImages: options.includeImages !== false,
    speakerNotes: options.speakerNotes !== false
  };
}

function buildNarrative(slides) {
  const stages = [
    ['Apertura (1 diapositiva)', 'título potente, subtítulo con la promesa y una imagen que fije el tono.'],
    ['Contexto (2–3 diapositivas)', 'por qué importa el tema ahora, para quién es y qué pregunta guía la presentación.'],
    ['Desarrollo (60 % de las diapositivas)', 'ideas principales en secuencia lógica, cada una con evidencia visual o dato.'],
    ['Síntesis (2 diapositivas)', 'conecta las ideas, resuelve la pregunta inicial y muestra el aprendizaje clave.'],
    ['Cierre (1 diapositiva)', 'llamada a la acción concreta, contacto o siguiente paso.']
  ];

  return stages.map(([name, purpose]) => `- ${name}: ${purpose}`).join('\n') +
    `\n\nTotal solicitado: ${slides} diapositivas (incluye portada, agenda opcional y cierre).`;
}

function buildVisualRules(options) {
  const imageRule = options.includeImages
    ? `- Imágenes: ${options.style.imagery}. Genera o selecciona imágenes propias y originales para cada concepto; no reutilices capturas, logos ni material de la presentación original. Todas las imágenes deben ser 16:9, sin texto incrustado, sin marcas de agua y con una dirección de arte coherente. Incluye el prompt de generación de cada imagen y su texto alternativo.`
    : '- Sin imágenes generadas: usa recursos tipográficos, formas y datos. Si propones una imagen, debe ser original y con licencia verificable.';

  return [
    `- Tema visual: ${options.style.name}. ${options.style.direction}.`,
    `- Paleta: ${options.palette.name}. ${options.palette.colors}. ${options.palette.note}.`,
    '- Formato: 16:9, 1920 × 1080 px, con márgenes seguros de 80 px.',
    '- Tipografía: sans-serif legible (por ejemplo Inter, Manrope, Source Sans 3 o la fuente corporativa si se indica).',
    '- Tamaños mínimos: titular 42–54 px, subtítulo 26–30 px, cuerpo 20–24 px, etiquetas 14–16 px. Nunca bajes de 18 px en el cuerpo.',
    '- Contraste: texto principal sobre fondo claro con ratio mínimo 4.5:1; no uses texto claro sobre imágenes sin una capa de contraste.',
    imageRule
  ].join('\n');
}

function buildContentRules(options) {
  const notesRule = options.speakerNotes
    ? '- Incluye notas del presentador para cada diapositiva (2–4 frases) con el argumento y una transición natural a la siguiente.'
    : '- No incluyas notas del presentador; todo el mensaje debe quedar claro en la diapositiva.';

  return [
    '- Una sola idea principal por diapositiva; el titular debe ser una afirmación, no una etiqueta genérica.',
    '- Máximo 5 viñetas por diapositiva y 12–18 palabras por viñeta. Si necesitas más detalle, divídelo en otra diapositiva.',
    '- Convierte datos en visuales: cifras grandes, comparaciones, timeline, matriz o diagrama. No inventes cifras: usa "[dato pendiente]" cuando falte información.',
    '- Usa un lenguaje claro, sin jerga innecesaria; explica cualquier término técnico la primera vez.',
    '- Cada imagen debe tener texto alternativo breve y descriptivo.',
    notesRule
  ].join('\n');
}

/**
 * Construye el prompt final a partir del análisis y las preferencias.
 */
function buildPresentationPrompt(input = {}) {
  const analysis = buildAnalysis(input.analysis || input);
  const options = normalizeOptions(input.options || {});
  const sourceLine = analysis.sourceUrl
    ? `- Enlace de referencia: ${analysis.sourceUrl}`
    : '- Sin enlace de referencia.';

  const descriptionLine = analysis.description
    ? `- Descripción detectada: ${analysis.description}`
    : '- No se detectó una descripción pública; usa el título y las notas adicionales como contexto.';

  const keywordsLine = analysis.keywords.length
    ? `- Conceptos clave: ${analysis.keywords.join(', ')}.`
    : '- Conceptos clave: deduce 5–8 términos del tema a partir del título y las notas.';

  const notesBlock = options.notes
    ? `\n## Contexto adicional aportado por el usuario\n${options.notes}\n`
    : '';

  const brandBlock = options.brand
    ? `- Marca o proyecto: ${options.brand}. Respeta su personalidad, pero no inventes logotipos ni copies identidad visual de terceros.`
    : '- Sin marca definida: crea una identidad visual neutra, original y fácil de reutilizar.';

  return `# Encargo: crear una presentación nueva y original

## Rol
Actúa como director creativo de presentaciones, estratega de contenido y diseñador editorial. Tu trabajo es reinterpretar el tema de la presentación de referencia con una identidad visual completamente nueva, no replicar la original.

## Objetivo
${options.goalText}.

- Audiencia: ${options.audience}.
- Tono: ${options.toneText}.
- Idioma de todo el contenido: ${options.languageName}.
- Número de diapositivas: ${options.slides}.
${brandBlock}

## Punto de partida (análisis de la presentación original)
- Título detectado: ${analysis.title}.
- Diapositivas detectadas: ${analysis.slideCount || 'no determinadas'}.
${descriptionLine}
${keywordsLine}
${sourceLine}

## Regla de originalidad
No copies ni parafrasees literalmente el texto original, y no reutilices sus imágenes, iconos, logotipos, plantillas ni capturas. Usa el análisis solo para entender el tema, la intención y la estructura. Crea contenido nuevo, con ejemplos y explicaciones propias. Si el tema lo permite, aporta un ángulo distinto y más actual.

## Identidad visual
${buildVisualRules(options)}

## Reglas de contenido
${buildContentRules(options)}

## Estructura narrativa sugerida
${buildNarrative(options.slides)}
${notesBlock}
## Entrega esperada
Devuelve la propuesta en una tabla con estas columnas:

| # | Titular de la diapositiva | Idea clave | Contenido (máx. 5 viñetas) | Concepto visual | Prompt de imagen | Notas del presentador |

Además:
1. Antes de la tabla, escribe en 3 líneas el concepto creativo y la paleta elegida.
2. Después de la tabla, incluye una lista de verificación de calidad: legibilidad, contraste, coherencia visual, originalidad y claridad del mensaje.
3. Si detectas que falta información para algún dato, márcalo como "[dato pendiente]" en lugar de inventarlo.
4. No incluyas texto dentro de las imágenes generadas; el texto debe vivir en la diapositiva.

Empieza directamente con la propuesta, sin explicar el proceso.`;
}

module.exports = {
  LANGUAGE_NAMES,
  GOALS,
  TONES,
  STYLES,
  PALETTES,
  extractKeywords,
  cleanTitle,
  clampSlides,
  buildAnalysis,
  normalizeOptions,
  buildPresentationPrompt
};
