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
  const topicSlides = Math.max(1, slides - 4);
  const minTopics = Math.max(1, Math.ceil(topicSlides / 2));
  const maxTopics = Math.max(minTopics, Math.min(6, topicSlides));
  const lastTopicSlide = slides - 2;

  return [
    '- Diapositiva 1 — Portada: título claro que refleje el tema analizado, subtítulo que explique la promesa de aprendizaje y una imagen original representativa.',
    '- Diapositiva 2 — Introducción y agenda: presenta el contexto, el objetivo y la relevancia; enumera los temas que se desarrollarán, en el mismo orden y con los mismos nombres que sus secciones.',
    `- Diapositivas 3–${lastTopicSlide} — Desarrollo (${topicSlides} diapositivas): organiza el contenido en ${minTopics}–${maxTopics} temas principales basados en la información analizada.`,
    '  - Dedica exactamente 1 o 2 diapositivas consecutivas a cada tema: una para explicar la idea central y otra, si hace falta, para un ejemplo, aplicación, evidencia o caso.',
    '  - Desarrolla cada tema con claridad y detalle; no lo conviertas en una lista de etiquetas ni excedas 2 diapositivas por tema.',
    `- Diapositiva ${slides - 1} — Síntesis y conclusión: conecta los aprendizajes, responde al objetivo y destaca las conclusiones principales.`,
    `- Diapositiva ${slides} — Cierre: propone un siguiente paso y, cuando se hayan usado fuentes verificables, incluye referencias breves y legibles.`,
    `\nTotal exacto: ${slides} diapositivas, incluida portada, introducción/agenda, desarrollo y cierre. Ajusta la cantidad de temas al espacio disponible sin eliminar los conceptos centrales.`
  ].join('\n');
}

function buildVisualRules(options) {
  const imageRule = options.includeImages
    ? `- Imágenes: ${options.style.imagery}. Crea una imagen o visual original, pertinente y diferente para cada diapositiva, incluida la portada, la agenda y el cierre. No reutilices imágenes, capturas, logos ni material de la presentación original. Usa formato 16:9, sin texto incrustado ni marcas de agua, con dirección de arte coherente. Especifica el prompt para generar la imagen y su texto alternativo en cada diapositiva.`
    : '- Sin imágenes generadas: usa recursos tipográficos, formas y datos. Si propones una imagen, debe ser original y con licencia verificable.';

  return [
    `- Tema visual: ${options.style.name}. ${options.style.direction}.`,
    `- Paleta: ${options.palette.name}. ${options.palette.colors}. ${options.palette.note}.`,
    '- Diseña para proyección en aulas: formato 16:9, 1920 × 1080 px y márgenes seguros amplios; el texto debe leerse desde el fondo del salón.',
    '- Tipografía sans-serif muy legible (por ejemplo Inter, Manrope o Source Sans 3), con títulos de 50–64 px, subtítulos de 34–40 px y cuerpo de 28–32 px. No uses texto de cuerpo menor de 24 px.',
    '- Usa fondos claros, alto contraste (mínimo 4.5:1) y espacio en blanco. No coloques texto claro sobre imágenes sin una superficie de contraste.',
    '- Evita párrafos extensos, tablas densas y adornos pequeños; prioriza una jerarquía visual clara y una idea principal por diapositiva.',
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
    '- Para cada tema, explica qué es, cómo funciona o por qué importa, y añade un ejemplo o aplicación cuando el material de referencia lo permita.',
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
- Usa estos datos y el enlace de referencia para identificar los temas y conceptos que deben conservarse. Si el contenido completo del enlace no está disponible, trabaja con los metadatos detectados y señala cualquier dato faltante; no afirmes haber leído diapositivas que no pudiste consultar.

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
Desarrolla la presentación completa, no solo un resumen o una lista de ideas. Si la IA puede crear archivos, genera una presentación editable en PPTX y una versión PDF; si no puede adjuntar archivos, entrega contenido listo para trasladar a PowerPoint, Google Slides o Canva y exportarlo.

Devuelve el contenido diapositiva por diapositiva en una tabla con estas columnas:

| # | Titular | Subtítulo | Idea clave | Contenido (máx. 5 viñetas) | Concepto visual | Prompt de imagen | Notas del presentador |

Además:
1. Incluye una fila por diapositiva y respeta el orden, la estructura y el total exacto indicados; no agrupes varias diapositivas en una sola fila.
2. Antes de la tabla, escribe en 3 líneas el concepto creativo y la paleta elegida.
3. Después de la tabla, incluye una lista de verificación de calidad: lectura desde el fondo del aula, tamaño del texto, contraste, imágenes originales, coherencia visual y claridad del mensaje.
4. Si detectas que falta información para algún dato, márcalo como "[dato pendiente]" en lugar de inventarlo.
5. No incluyas texto dentro de las imágenes generadas; el texto debe vivir en la diapositiva.

Empieza directamente con la propuesta, sin explicar el proceso.`;
}

const GENERIC_TITLE_PATTERN = /^(?:sin t[ií]tulo|presentaci[oó]n(?: sin t[ií]tulo)?|introducci[oó]n(?:\s+(?:a|al|la|el|los|las))?|tema(?:\s+\d+)?)$/i;

function capText(value, max) {
  const text = normalizeWhitespace(value);
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

const SUMMARY_MAX_SLIDES = 30;
const SUMMARY_MAX_CHARS = 4000;

/** Fragmentos acotados antes de alimentar el resumen o enviarlos al servidor. */
function normalizeSlideTexts(value) {
  return (Array.isArray(value) ? value.slice(0, SUMMARY_MAX_SLIDES) : [])
    .map((item) => capText(item && typeof item === 'object' ? item.text : item, SUMMARY_MAX_CHARS))
    .filter(Boolean);
}

function firstSentence(value, max) {
  const text = normalizeWhitespace(value);
  if (!text) return '';

  const match = text.match(/^[^.!?]+[.!?]?/);
  return capText(match ? match[0] : text, max);
}

/**
 * Resumen estructurado y determinista de la presentación.
 *
 * Es complementario al prompt: no llama a ningún servicio externo y solo usa
 * metadatos y, cuando existen, los fragmentos de texto reconocido por OCR.
 * Toda frase se devuelve como dato para que la interfaz la pinte con textContent.
 */
function buildStructuredSummary(input = {}) {
  const analysis = input.analysis && typeof input.analysis === 'object' ? input.analysis : input;
  const title = cleanTitle(analysis.title);
  const description = normalizeWhitespace(analysis.description);
  const author = capText(analysis.author, 120);
  const slideCount = Math.max(0, Number.parseInt(analysis.slideCount, 10) || 0);
  const slideTexts = normalizeSlideTexts(analysis.slideTexts);
  const ocrSlides = slideTexts.filter((text) => text.length >= 20).length;

  const keywords = Array.isArray(analysis.keywords) && analysis.keywords.length
    ? analysis.keywords.slice(0, 10).map((word) => capText(word, 40)).filter(Boolean)
    : extractKeywords({ title, description }, 6);

  const hasTitle = Boolean(title) && !GENERIC_TITLE_PATTERN.test(title);
  const hasDescription = Boolean(description);
  const descriptionLead = firstSentence(description, 240);
  const topic = hasTitle
    ? title
    : (descriptionLead || keywords.slice(0, 3).join(' y ') || 'Tema no determinado');

  let topicConfidence = 'baja';
  if (hasTitle && hasDescription) topicConfidence = 'alta';
  else if (hasTitle || (descriptionLead && keywords.length >= 2)) topicConfidence = 'media';
  if (ocrSlides >= 2) topicConfidence = 'alta';

  const overviewParts = [
    `La presentación «${topic}»${author ? `, de ${author}` : ''}${
      slideCount ? `, reúne ${slideCount} diapositivas` : ', no tiene un número de diapositivas confirmado'
    }.`,
    hasDescription ? descriptionLead : 'No hay una descripción pública disponible.'
  ];

  if (ocrSlides) {
    overviewParts.push(`Se analizó el texto reconocido en ${ocrSlides} diapositivas.`);
  }

  const keyPoints = keywords.slice(0, 4).map((word) => `Concepto destacado: ${word}.`);

  for (const [index, text] of slideTexts.entries()) {
    if (keyPoints.length >= 6) break;
    if (text.length < 20) continue;
    keyPoints.push(`Diapositiva ${index + 1}: ${capText(firstSentence(text, 180), 180)}.`);
  }

  if (!keyPoints.length) {
    keyPoints.push('No hay puntos clave suficientes en los metadatos disponibles.');
  }

  const suggestedOutline = [
    `Introducción: contexto y relevancia de ${topic}.`,
    'Desarrollo: ideas principales, ejemplos y evidencias del material disponible.',
    'Síntesis: conclusiones y siguientes pasos.'
  ];

  const limitations = [];

  if (!hasDescription) {
    limitations.push('No hay descripción pública: el tema se infiere del título y las palabras clave.');
  }
  if (!slideCount) {
    limitations.push('No se determinó el número de diapositivas.');
  }
  if (!ocrSlides) {
    limitations.push('No se dispone del texto de las diapositivas; el resumen se basa en metadatos.');
  }
  if (analysis.challengeDetected) {
    limitations.push('SlideShare mostró una verificación: parte de los metadatos puede estar incompleta.');
  }

  return {
    topic,
    topicConfidence,
    overview: overviewParts.join(' '),
    keyPoints,
    suggestedOutline,
    evidence: {
      title: hasTitle,
      description: hasDescription,
      author: Boolean(author),
      slideCount,
      ocrSlides
    },
    limitations,
    source: ocrSlides ? 'metadata+ocr' : 'metadata'
  };
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
  buildStructuredSummary,
  normalizeSlideTexts,
  normalizeOptions,
  buildPresentationPrompt
};
