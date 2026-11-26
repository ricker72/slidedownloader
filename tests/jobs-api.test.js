const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { createJobsRouter } = require('../api/jobs');
const { processNextJob } = require('../services/jobWorker');
const { MemoryJobStore, hashToken } = require('../services/jobStore');
const { MemoryArtifactStore } = require('../services/artifactStore');
const { resetRateLimitStores } = require('../middleware/rateLimiter');

const VALID_URL = 'https://www.slideshare.net/slideshow/ejemplo/12345678';

async function withServer(handler, { isEnabled = true } = {}) {
  resetRateLimitStores();

  const jobStore = new MemoryJobStore();
  const artifactStore = new MemoryArtifactStore();
  const app = express();
  app.use(express.json());
  app.use(createJobsRouter({ jobStore, artifactStore, isEnabled }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await handler({ baseUrl, jobStore, artifactStore });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('POST /api/jobs encola el trabajo y devuelve URL de sondeo con token', async () => {
  await withServer(async ({ baseUrl, jobStore }) => {
    const response = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: VALID_URL, format: 'pptx', quality: 'hd' })
    });
    const body = await response.json();

    assert.equal(response.status, 202);
    assert.equal(body.success, true);
    assert.equal(body.status, 'queued');
    assert.match(body.pollUrl, new RegExp(`^/api/jobs/${body.jobId}\\?token=.+`));

    const job = jobStore.get(body.jobId);
    assert.equal(job.payload.format, 'pptx');
    assert.equal(job.payload.quality, 'hd');
    assert.notEqual(job.tokenHash, body.token);
  });
});

test('POST /api/jobs rechaza peticiones inválidas con el mismo contrato', async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/otro' })
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error, 'URL inválida de SlideShare');
  });
});

test('GET /api/jobs/:id exige UUID y token de posesión', async () => {
  await withServer(async ({ baseUrl, jobStore }) => {
    const token = 'token-de-prueba';
    const job = jobStore.create({
      id: randomUUID(),
      tokenHash: hashToken(token),
      status: 'done',
      payload: { url: VALID_URL, format: 'pdf', quality: 'sd' },
      result: { fileName: 'deck.pdf', format: 'pdf' }
    });

    const badId = await fetch(`${baseUrl}/api/jobs/no-es-uuid?token=${token}`);
    assert.equal(badId.status, 400);

    const noToken = await fetch(`${baseUrl}/api/jobs/${job.id}`);
    assert.equal(noToken.status, 401);

    const wrongToken = await fetch(`${baseUrl}/api/jobs/${job.id}?token=otro`);
    assert.equal(wrongToken.status, 404);

    const ok = await fetch(`${baseUrl}/api/jobs/${job.id}?token=${encodeURIComponent(token)}`);
    const body = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(body.job.status, 'done');
    assert.equal(body.job.result.fileName, 'deck.pdf');
    assert.equal(JSON.stringify(body).includes('slideshare.net'), false);
    assert.equal(JSON.stringify(body).includes('tokenHash'), false);
  });
});

test('GET /api/jobs/:id/artifact/:filename sirve el archivo solo al poseedor del token', async () => {
  await withServer(async ({ baseUrl, jobStore, artifactStore }) => {
    const token = 'token-artefacto';
    const jobId = randomUUID();
    const artifactKey = `jobs/${jobId}/deck.pdf`;
    await artifactStore.put(artifactKey, Buffer.from('%PDF-1.4'), {
      contentType: 'application/pdf'
    });
    jobStore.create({
      id: jobId,
      tokenHash: hashToken(token),
      status: 'done',
      result: { artifactKey, contentType: 'application/pdf' }
    });

    const response = await fetch(
      `${baseUrl}/api/jobs/${jobId}/artifact/deck.pdf?token=${encodeURIComponent(token)}`
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(await response.text(), '%PDF-1.4');

    const longName = await fetch(
      `${baseUrl}/api/jobs/${jobId}/artifact/${'a'.repeat(201)}?token=${encodeURIComponent(token)}`
    );
    assert.equal(longName.status, 400);

    const otherToken = await fetch(
      `${baseUrl}/api/jobs/${jobId}/artifact/deck.pdf?token=otro`
    );
    assert.equal(otherToken.status, 404);
  });
});

test('los endpoints de jobs responden 404 cuando JOBS_ENABLED es falso', async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: VALID_URL })
    });
    const poll = await fetch(`${baseUrl}/api/jobs/${randomUUID()}?token=x`);
    const artifact = await fetch(
      `${baseUrl}/api/jobs/${randomUUID()}/artifact/deck.pdf?token=x`
    );

    assert.equal(response.status, 404);
    assert.equal(poll.status, 404);
    assert.equal(artifact.status, 404);
    assert.deepEqual(await poll.json(), { success: false, error: 'No encontrado' });
  }, { isEnabled: false });
});

test('flujo completo: encolar, procesar, sondear y descargar con tokens reales', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-jobs-api-'));

  try {
    await withServer(async ({ baseUrl, jobStore, artifactStore }) => {
      const enqueued = await fetch(`${baseUrl}/api/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: VALID_URL, format: 'pdf', quality: 'sd' })
      });
      const created = await enqueued.json();
      assert.equal(enqueued.status, 202);

      const jobDir = path.join(dir, created.jobId);
      fs.mkdirSync(jobDir);
      const filePath = path.join(jobDir, 'deck.pdf');
      fs.writeFileSync(filePath, '%PDF-1.4 real');

      const processed = await processNextJob({
        jobStore,
        artifactStore,
        generate: async () => ({
          filePath,
          fileName: 'deck.pdf',
          title: 'Deck integral',
          format: 'pdf',
          quality: 'sd',
          imageCount: 3
        })
      });
      assert.equal(processed.status, 'done');

      const polled = await fetch(`${baseUrl}${created.pollUrl}`);
      const state = await polled.json();
      assert.equal(polled.status, 200);
      assert.equal(state.job.status, 'done');
      assert.equal(state.job.result.fileName, 'deck.pdf');
      assert.equal(state.pollAfterMs, 2000);
      assert.equal(state.job.result.slideCount, 3);

      const artifactUrl = state.job.result.downloadUrl;
      const artifactToken = new URL(`${baseUrl}${artifactUrl}`).searchParams.get('token');
      assert.ok(artifactToken);
      assert.notEqual(artifactToken, created.token);

      const downloaded = await fetch(`${baseUrl}${artifactUrl}`);
      assert.equal(downloaded.status, 200);
      assert.equal(downloaded.headers.get('content-type'), 'application/pdf');
      assert.equal(downloaded.headers.get('cache-control'), 'no-store');
      assert.equal(await downloaded.text(), '%PDF-1.4 real');

      // El token de sondeo no abre el artefacto: son capabilities distintas.
      const withPollToken = artifactUrl.replace(
        /token=[^&]+/,
        `token=${encodeURIComponent(created.token)}`
      );
      const denied = await fetch(`${baseUrl}${withPollToken}`);
      assert.equal(denied.status, 404);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('GET artefacto devuelve 410 cuando el enlace de descarga caducó', async () => {
  await withServer(async ({ baseUrl, jobStore, artifactStore }) => {
    const jobId = randomUUID();
    const token = 'token-artefacto';
    const artifactKey = `jobs/${jobId}/deck.pdf`;
    await artifactStore.put(artifactKey, Buffer.from('%PDF-1.4'), {
      contentType: 'application/pdf'
    });
    jobStore.create({
      id: jobId,
      tokenHash: hashToken('token-de-sondeo'),
      status: 'done',
      result: {
        artifactKey,
        contentType: 'application/pdf',
        artifactTokenHash: hashToken(token),
        downloadUrl: `/api/jobs/${jobId}/artifact/deck.pdf?token=${token}`,
        expiresAt: Date.now() - 1
      }
    });

    const response = await fetch(
      `${baseUrl}/api/jobs/${jobId}/artifact/deck.pdf?token=${encodeURIComponent(token)}`
    );
    assert.equal(response.status, 410);
    assert.equal((await response.json()).error, 'El enlace de descarga ha caducado');
  });
});

test('los tokens se aceptan en cabecera y se rechazan duplicados en la query', async () => {
  await withServer(async ({ baseUrl, jobStore }) => {
    const token = 'token-de-prueba';
    const job = jobStore.create({
      id: randomUUID(),
      tokenHash: hashToken(token),
      payload: { url: VALID_URL, format: 'pdf', quality: 'sd' }
    });

    const byHeader = await fetch(`${baseUrl}/api/jobs/${job.id}`, {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(byHeader.status, 200);

    const byCustomHeader = await fetch(`${baseUrl}/api/jobs/${job.id}`, {
      headers: { 'x-job-token': token }
    });
    assert.equal(byCustomHeader.status, 200);

    const duplicate = await fetch(
      `${baseUrl}/api/jobs/${job.id}?token=${token}&token=${token}`
    );
    assert.equal(duplicate.status, 401);
  });
});

test('los limitadores de encolado y sondeo aplican sus topes', async () => {
  await withServer(async ({ baseUrl, jobStore }) => {
    for (let index = 0; index < 5; index += 1) {
      const response = await fetch(`${baseUrl}/api/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: VALID_URL })
      });
      assert.equal(response.status, 202);
    }

    const sixth = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: VALID_URL })
    });
    assert.equal(sixth.status, 429);
    assert.equal(
      (await sixth.json()).error,
      'Demasiados trabajos encolados. Intenta de nuevo más tarde.'
    );
    assert.equal(jobStore.size, 5);

    const token = 'token-de-sondeo';
    const job = jobStore.create({
      id: randomUUID(),
      tokenHash: hashToken(token),
      payload: { url: VALID_URL, format: 'pdf', quality: 'sd' }
    });

    for (let index = 0; index < 60; index += 1) {
      const response = await fetch(`${baseUrl}/api/jobs/${job.id}?token=${token}`);
      assert.equal(response.status, 200);
    }

    const overflow = await fetch(`${baseUrl}/api/jobs/${job.id}?token=${token}`);
    assert.equal(overflow.status, 429);
    assert.equal(
      (await overflow.json()).error,
      'Demasiadas consultas de estado. Intenta de nuevo más tarde.'
    );
  });
});

test('JOB_TTL_MS configura la caducidad del trabajo y un valor inválido usa el default', async () => {
  const previous = process.env.JOB_TTL_MS;

  try {
    process.env.JOB_TTL_MS = '60000';
    await withServer(async ({ baseUrl, jobStore }) => {
      const before = Date.now();
      const response = await fetch(`${baseUrl}/api/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: VALID_URL })
      });
      const { jobId } = await response.json();
      const expiresAt = jobStore.get(jobId).expiresAt;
      assert.ok(expiresAt >= before + 59_000 && expiresAt <= Date.now() + 61_000);
    });

    process.env.JOB_TTL_MS = 'no-es-un-numero';
    await withServer(async ({ baseUrl, jobStore }) => {
      const before = Date.now();
      const response = await fetch(`${baseUrl}/api/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: VALID_URL })
      });
      const { jobId } = await response.json();
      const expiresAt = jobStore.get(jobId).expiresAt;
      assert.ok(expiresAt >= before + 23 * 60 * 60 * 1000);
    });
  } finally {
    if (previous === undefined) delete process.env.JOB_TTL_MS;
    else process.env.JOB_TTL_MS = previous;
  }
});
