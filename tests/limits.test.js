const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const APP_PATH = path.join(ROOT, 'server', 'app.js');
const app = require(APP_PATH);
const { getLimits } = require('../services/slideshareService');

async function withServer(callback) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

function runWithEnv(script, envOverrides) {
  return execFileSync(process.execPath, ['-e', script], {
    cwd: ROOT,
    env: { ...process.env, ...envOverrides },
    encoding: 'utf8',
    timeout: 30000
  });
}

function parseChildJson(output) {
  const line = output
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith('LIMITS_JSON:'));
  assert.ok(line, `Respuesta inesperada del proceso hijo: ${output}`);
  return JSON.parse(line.slice('LIMITS_JSON:'.length));
}

test('GET /api/limits devuelve los límites reales del servidor', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/limits`);
    assert.equal(response.status, 200);

    const { success, ...limits } = await response.json();
    assert.equal(success, true);
    assert.deepEqual(limits, {
      ...getLimits(),
      jobsEnabled: false,
      textFormats: ['txt', 'md'],
      ocrEnabled: process.env.OCR_ENABLED === 'true'
    });
    assert.equal(limits.maxSlides, getLimits().maxSlides);
    assert.equal(limits.bytesPerSlide.hd, 450 * 1024);
  });
});

test('GET /api/limits refleja los valores configurados por entorno', () => {
  // Proceso hijo: las constantes se leen al cargar el módulo.
  const script = `
    const http = require('node:http');
    const app = require(${JSON.stringify(APP_PATH)});
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', async () => {
      try {
        const base = \`http://127.0.0.1:\${server.address().port}\`;
        const response = await fetch(base + '/api/limits');
        process.stdout.write('LIMITS_JSON:' + JSON.stringify(await response.json()));
      } catch (error) {
        process.stderr.write(String(error));
        process.exitCode = 1;
      } finally {
        server.closeAllConnections();
        server.close();
      }
    });
  `;

  const data = parseChildJson(
    runWithEnv(script, {
      MAX_SLIDES: '7',
      ESTIMATED_BYTES_PER_SLIDE_HD: '1024'
    })
  );

  assert.equal(data.success, true);
  assert.equal(data.maxSlides, 7);
  assert.equal(data.bytesPerSlide.hd, 1024);
  assert.equal(data.bytesPerSlide.sd, 120 * 1024);
});

test('/api/inspect informa diapositivas detectadas, recortadas y límites', () => {
  const script = `
    const http = require('node:http');
    const app = require(${JSON.stringify(APP_PATH)});
    const imageUrls = Array.from(
      { length: 10 },
      (_, index) => \`https://image.slidesharecdn.com/demo/v1/slide-\${index + 1}-638.jpg\`
    );

    const renderer = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      const related = [
        'https://image.slidesharecdn.com/relacionadas/thumb-1.jpg',
        'https://image.slidesharecdn.com/relacionadas/thumb-2.jpg',
        'https://image.slidesharecdn.com/relacionadas/thumb-3.jpg'
      ];
      res.end(JSON.stringify({
        success: true,
        title: 'Presentación de prueba',
        imageUrls: imageUrls.concat(related)
      }));
    });

    renderer.listen(0, '127.0.0.1', () => {
      process.env.RENDERER_URL = \`http://127.0.0.1:\${renderer.address().port}\`;
      const server = http.createServer(app);
      server.listen(0, '127.0.0.1', async () => {
        try {
          const base = \`http://127.0.0.1:\${server.address().port}\`;
          const response = await fetch(base + '/api/inspect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: 'https://www.slideshare.net/usuario/demo' })
          });
          process.stdout.write('LIMITS_JSON:' + JSON.stringify(await response.json()));
        } catch (error) {
          process.stderr.write(String(error));
          process.exitCode = 1;
        } finally {
          server.closeAllConnections();
          renderer.closeAllConnections();
          server.close();
          renderer.close();
        }
      });
    });
  `;

  const data = parseChildJson(runWithEnv(script, { MAX_SLIDES: '7' }));

  assert.equal(data.success, true);
  assert.equal(data.detectedSlideCount, 10);
  assert.equal(data.slideCount, 7);
  assert.equal(data.limits.maxSlides, 7);
  assert.equal(data.previewImages.length, 7);
});

test('la UI muestra los límites sin inyectar HTML', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public', 'style.css'), 'utf8');

  assert.match(html, /id="limits-section"[^>]*hidden/);
  assert.match(html, /id="limits-grid"/);
  assert.match(html, /id="limits-warning"[^>]*aria-live="polite"/);
  assert.match(html, /app\.js\?v=11/);

  assert.match(appJs, /fetch\('\/api\/limits'\)/);
  assert.match(appJs, /applyLimits\(data\.limits\)/);
  assert.match(appJs, /renderLimits\(\)/);
  assert.match(appJs, /description\.textContent = value/);
  assert.doesNotMatch(appJs, /limits(?:Grid|Warning)\.innerHTML/);
  assert.doesNotMatch(appJs, /limits(?:Grid|Warning)\.insertAdjacentHTML/);

  assert.match(css, /\.limits-grid dd/);
  assert.match(css, /\.limits-warning\[hidden\]/);
});
