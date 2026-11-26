/**
 * Exportación de texto de una presentación.
 *
 * Genera TXT o Markdown con el texto reconocido (si hay OCR) y, en su defecto,
 * con los metadatos públicos. El texto se trata siempre como dato: se limpian
 * caracteres de control y se escapa la sintaxis Markdown para que el contenido
 * de una diapositiva no pueda alterar la estructura del archivo.
 */

const fs = require('fs/promises');
const path = require('path');

const TEXT_FORMATS = ['txt', 'md'];
const MAX_CHARS_PER_SLIDE = 4000;
const MAX_CHARS_TOTAL = 200000;
const MAX_SLIDE_BLOCKS = 30;
const TRUNCATION_NOTICE = '\n\n[Exportación truncada por límite de tamaño.]';

function cleanText(value) {
  return String(value == null ? '' : value)
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function cap(value, max) {
  const text = cleanText(value);
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

// Los metadatos van en una sola línea: un salto de línea en el título o en un
// aviso no debe poder añadir encabezados ni listas al Markdown generado.
function inline(value, max) {
  return cap(value, max).replace(/\s+/g, ' ').trim();
}

function escapeMarkdown(text) {
  return text
    .split('\n')
    .map((line) => (/^\s{0,3}(?:#{1,6}\s|>\s|[-*+]\s|\d+\.\s)/.test(line) ? `\\${line}` : line))
    .join('\n');
}

function normalizeWarnings(raw) {
  const warnings = [];
  const seen = new Set();

  for (const item of Array.isArray(raw) ? raw : []) {
    const text = inline(item, 300);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    warnings.push(text);
    if (warnings.length >= 10) break;
  }

  return warnings;
}

function buildSlideBlocks(slideTexts, markdown, slideCount = 0) {
  const items = (Array.isArray(slideTexts) ? slideTexts : []).slice(0, MAX_SLIDE_BLOCKS);
  const bySlide = new Map();

  items.forEach((item, index) => {
    const isObject = item && typeof item === 'object';
    const parsed = isObject ? Number.parseInt(item.slide, 10) : NaN;
    const slide = Number.isFinite(parsed) && parsed > 0 ? parsed : index + 1;
    const error = isObject ? cap(item.error, 200) : '';
    let body = cap(isObject ? item.text : item, MAX_CHARS_PER_SLIDE) || '[Texto no disponible]';

    if (error) body = `${body}\n[Aviso: ${error}]`;
    if (markdown) body = escapeMarkdown(body);
    bySlide.set(slide, body);
  });

  const detected = Math.max(0, Number.parseInt(slideCount, 10) || 0);
  const total = Math.min(MAX_SLIDE_BLOCKS, Math.max(detected, bySlide.size));
  const blocks = [];

  // Sin OCR se conserva un bloque por diapositiva detectada: el archivo
  // mantiene la estructura original y sirve como ficha de estudio.
  for (let slide = 1; slide <= total; slide += 1) {
    blocks.push({ slide, body: bySlide.get(slide) || '[Texto no disponible]' });
  }

  return blocks;
}

/**
 * @returns {{ text: string, warnings: string[] }}
 */
function buildTextExport(input = {}) {
  const format = String(input.format || 'txt').toLowerCase();

  if (!TEXT_FORMATS.includes(format)) {
    const error = new Error(`Formato de texto no soportado: ${format}`);
    error.status = 400;
    throw error;
  }

  const markdown = format === 'md';
  const title = inline(input.title, 200) || 'Presentación sin título';
  const author = inline(input.author, 120) || 'No detectado';
  let sourceUrl = 'No disponible';

  try {
    const parsed = new URL(cleanText(input.sourceUrl));
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') sourceUrl = parsed.href;
  } catch (error) {
    // La fuente es opcional: no invalidamos la exportación por ella.
  }

  const slideCount = Math.max(0, Number.parseInt(input.slideCount, 10) || 0);
  const generatedAt = inline(input.generatedAt, 60);
  const warnings = normalizeWarnings(input.warnings);
  const method = input.source === 'ocr'
    ? 'OCR (texto reconocido en las imágenes)'
    : 'Metadatos públicos (sin OCR)';
  const blocks = buildSlideBlocks(input.slideTexts, markdown, slideCount);
  const lines = [];

  if (markdown) {
    lines.push(`# ${escapeMarkdown(title)}`, '', '> Exportación de texto generada por SlideDownloader.', '');
    lines.push(`- **Autor**: ${author}`);
    lines.push(`- **Fuente**: ${sourceUrl}`);
    lines.push(`- **Diapositivas detectadas**: ${slideCount}`);
    lines.push(`- **Método**: ${method}`);
    if (generatedAt) lines.push(`- **Generado**: ${generatedAt}`);
    lines.push('');

    for (const block of blocks) {
      lines.push(`## Diapositiva ${block.slide}`, '', block.body, '');
    }

    lines.push('## Limitaciones', '');
  } else {
    lines.push('SlideDownloader - exportación de texto', '');
    lines.push(`Título: ${title}`);
    lines.push(`Autor: ${author}`);
    lines.push(`Fuente: ${sourceUrl}`);
    lines.push(`Diapositivas detectadas: ${slideCount}`);
    lines.push(`Método: ${method}`);
    if (generatedAt) lines.push(`Generado: ${generatedAt}`);
    lines.push('');

    for (const block of blocks) {
      lines.push(`--- Diapositiva ${block.slide} ---`, '', block.body, '');
    }

    lines.push('Limitaciones', '');
  }

  if (warnings.length) {
    for (const warning of warnings) lines.push(`- ${warning}`);
  } else {
    lines.push('- No se registraron incidencias durante la exportación.');
  }

  if (input.source !== 'ocr') {
    lines.push('- El texto procede de metadatos públicos; no es una transcripción de las diapositivas.');
  }

  let text = `${lines.join('\n').trim()}\n`;

  if (text.length > MAX_CHARS_TOTAL) {
    text = `${text.slice(0, MAX_CHARS_TOTAL - TRUNCATION_NOTICE.length)}${TRUNCATION_NOTICE}`;
  }

  return { text, warnings };
}

/**
 * Escribe el archivo en el directorio del trabajo y devuelve la misma forma que
 * el resto de generadores de `slideshareService`.
 */
async function createTextExportFile(input = {}, outputDir, deps = {}) {
  const format = String(input.format || 'txt').toLowerCase();

  if (!TEXT_FORMATS.includes(format)) {
    const error = new Error(`Formato de texto no soportado: ${format}`);
    error.status = 400;
    throw error;
  }

  if (typeof deps.sanitizeFileName !== 'function') {
    throw new Error('createTextExportFile requiere sanitizeFileName');
  }
  if (typeof outputDir !== 'string' || !outputDir) {
    throw new Error('createTextExportFile requiere outputDir');
  }

  const { text, warnings } = buildTextExport(input);
  const fileName = deps.sanitizeFileName(input.title || deps.defaultTitle || 'Presentacion', format);
  const outputFile = path.join(outputDir, fileName);

  await fs.writeFile(outputFile, text, 'utf8');

  return {
    outputFile,
    filename: fileName,
    slideCount: Math.max(0, Number.parseInt(input.slideCount, 10) || 0),
    source: input.source === 'ocr' ? 'ocr' : 'metadata',
    warnings
  };
}

module.exports = {
  TEXT_FORMATS,
  MAX_CHARS_PER_SLIDE,
  MAX_CHARS_TOTAL,
  buildTextExport,
  createTextExportFile
};
