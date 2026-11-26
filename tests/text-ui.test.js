const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const homeHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const aiHtml = fs.readFileSync(path.join(ROOT, 'public', 'ai.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const aiJs = fs.readFileSync(path.join(ROOT, 'public', 'ai.js'), 'utf8');
const styleCss = fs.readFileSync(path.join(ROOT, 'public', 'style.css'), 'utf8');

test('la portada ofrece los formatos de texto y actualiza el contador', () => {
  assert.match(homeHtml, /value="txt"/);
  assert.match(homeHtml, /value="md"/);
  assert.match(homeHtml, /7 formatos disponibles/);
  assert.match(homeHtml, /<symbol id="i-txt"/);
  assert.match(appJs, /txt: 'Solo texto \(TXT\)'/);
  assert.match(appJs, /md: 'Markdown \(MD\)'/);
});

test('el asistente muestra el resumen estructurado en su propio panel', () => {
  assert.match(aiHtml, /id="ai-summary-container" class="summary-panel" hidden/);
  assert.match(aiHtml, /id="summary-topic"/);
  assert.match(aiHtml, /id="summary-overview"[^>]*aria-live="polite"/);
  assert.match(aiHtml, /id="summary-confidence"/);
  assert.match(aiHtml, /id="summary-points"/);
  assert.match(aiHtml, /id="summary-outline"/);
  assert.match(aiHtml, /id="summary-limitations"/);
  assert.match(aiHtml, /id="summary-output" hidden/);
  assert.match(aiHtml, /id="summary-copy-label"/);
  assert.match(styleCss, /\.summary-panel\[hidden\]/);
  assert.match(styleCss, /\.summary-list:empty/);
});

test('el panel del resumen no inyecta HTML', () => {
  assert.match(aiJs, /function renderSummary\(summary\)/);
  assert.match(aiJs, /function fillSummaryList\(container, values\)/);
  assert.match(aiJs, /summaryTopic\.textContent/);
  assert.match(aiJs, /summaryOverview\.textContent/);
  assert.match(aiJs, /summaryOutput\.textContent/);
  assert.match(aiJs, /summaryCopyLabel\.textContent/);
  assert.match(aiJs, /summaryContainer\.hidden = true/);
  assert.match(aiJs, /renderSummary\(data\.summary\)/);
  assert.doesNotMatch(aiJs, /summary[A-Za-z]*\.innerHTML/);
  assert.doesNotMatch(aiJs, /summary[A-Za-z]*\.insertAdjacentHTML/);
});
