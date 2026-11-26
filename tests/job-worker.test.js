const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { MemoryJobStore, hashToken, toPublicJob } = require('../services/jobStore');
const { MemoryArtifactStore } = require('../services/artifactStore');
const {
  processNextJob,
  safeFileName,
  sweepExpired,
  DEFAULT_URL_TTL_MS
} = require('../services/jobWorker');

const VALID_URL = 'https://www.slideshare.net/slideshow/ejemplo/12345678';

function createStores() {
  return { jobStore: new MemoryJobStore(), artifactStore: new MemoryArtifactStore() };
}

function enqueue(jobStore, overrides = {}) {
  return jobStore.create({
    id: randomUUID(),
    tokenHash: hashToken('token-de-prueba'),
    payload: { url: VALID_URL, format: 'pdf', quality: 'sd' },
    ...overrides
  });
}

test('processNextJob no hace nada si la cola está vacía', async () => {
  const stores = createStores();
  const result = await processNextJob(stores);

  assert.equal(result.processed, false);
});

test('processNextJob guarda el artefacto y publica una URL firmada', async () => {
  const { jobStore, artifactStore } = createStores();
  const job = enqueue(jobStore);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-job-worker-'));
  const jobDir = path.join(dir, job.id);
  fs.mkdirSync(jobDir);
  const filePath = path.join(jobDir, 'deck final.pdf');
  fs.writeFileSync(filePath, '%PDF-1.4');

  const result = await processNextJob({
    jobStore,
    artifactStore,
    generate: async () => ({
      filePath,
      fileName: 'deck final.pdf',
      title: 'Mi presentación',
      format: 'pdf',
      quality: 'sd',
      imageCount: 12
    })
  });

  assert.equal(result.processed, true);
  assert.equal(result.status, 'done');

  const done = jobStore.get(job.id);
  assert.equal(done.status, 'done');
  assert.equal(done.progress, 100);
  assert.match(done.result.downloadUrl, new RegExp(`^/api/jobs/${job.id}/artifact/deck_final\\.pdf\\?token=.+`));
  assert.equal(fs.existsSync(jobDir), false, 'el worker limpia el directorio temporal');

  const artifact = await artifactStore.get(done.result.artifactKey);
  assert.equal(artifact.toString(), '%PDF-1.4');

  const publicJob = toPublicJob(done);
  assert.equal(publicJob.status, 'done');
  assert.equal(publicJob.result.slideCount, 12);
  assert.ok(
    done.result.expiresAt >= Date.now() + DEFAULT_URL_TTL_MS - 5000
    && done.result.expiresAt <= Date.now() + DEFAULT_URL_TTL_MS + 5000,
    'el enlace caduca a los 15 min, no a los 24 h del trabajo'
  );
  assert.equal(JSON.stringify(publicJob).includes('artifactTokenHash'), false);
  assert.equal(JSON.stringify(publicJob).includes('slideshare.net'), false);
});

test('processNextJob reintenta una vez y luego marca el trabajo como fallido', async () => {
  const { jobStore, artifactStore } = createStores();
  const job = enqueue(jobStore);
  const generate = async () => {
    throw new Error('fallo temporal');
  };

  const first = await processNextJob({ jobStore, artifactStore, generate, maxAttempts: 2 });
  assert.equal(first.status, 'queued');
  assert.equal(jobStore.get(job.id).attempts, 1);
  assert.ok(jobStore.get(job.id).nextAttemptAt > Date.now());

  // El backoff evita agotar los reintentos en el mismo segundo.
  const delayed = await processNextJob({ jobStore, artifactStore, generate, maxAttempts: 2 });
  assert.equal(delayed.processed, false);
  assert.equal(jobStore.get(job.id).attempts, 1);

  jobStore.update(job.id, { nextAttemptAt: 0 });
  const second = await processNextJob({ jobStore, artifactStore, generate, maxAttempts: 2 });
  assert.equal(second.status, 'failed');
  assert.equal(second.error, 'fallo temporal');
  assert.equal(jobStore.get(job.id).error, 'fallo temporal');
});

test('processNextJob no reintenta errores de validación permanentes', async () => {
  const { jobStore, artifactStore } = createStores();
  const job = enqueue(jobStore);
  const error = new Error('URL inválida de SlideShare');
  error.status = 400;
  const generate = async () => { throw error; };

  const first = await processNextJob({ jobStore, artifactStore, generate });
  const second = await processNextJob({ jobStore, artifactStore, generate });

  assert.equal(first.status, 'failed');
  assert.equal(second.processed, false);
  assert.equal(jobStore.get(job.id).attempts, 1);
});

test('processNextJob usa dos intentos por defecto y oculta errores en producción', async () => {
  const { jobStore, artifactStore } = createStores();
  const job = enqueue(jobStore);
  const generate = async () => { throw new Error('ruta/interna/secreta'); };

  const first = await processNextJob({ jobStore, artifactStore, generate, isProduction: true });
  assert.equal(first.status, 'queued');
  assert.equal(first.error, 'Error interno del servidor');

  jobStore.update(job.id, { nextAttemptAt: 0 });
  const second = await processNextJob({ jobStore, artifactStore, generate, isProduction: true });
  assert.equal(second.status, 'failed');
  assert.equal(second.error, 'Error interno del servidor');
  assert.equal(jobStore.get(job.id).error, 'Error interno del servidor');
  assert.equal(JSON.stringify(second).includes('ruta/interna'), false);
});

test('sweepExpired limpia trabajos y artefactos caducados', async () => {
  const { jobStore, artifactStore } = createStores();
  const job = enqueue(jobStore, { expiresAt: Date.now() - 1 });
  const key = `jobs/${job.id}/deck.pdf`;
  await artifactStore.put(key, Buffer.from('%PDF'));
  artifactStore.objects.get(key).expiresAt = Date.now() - 1;

  const removed = await sweepExpired({ jobStore, artifactStore });
  assert.deepEqual(removed, { jobs: 1, artifacts: 1 });
  assert.equal(jobStore.get(job.id), null);
  assert.equal(await artifactStore.get(key), null);
});

test('el worker del servidor procesa de uno en uno y no arranca fuera del proceso principal', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'app.js'), 'utf8');
  assert.match(appJs, /const jobsRunnable = jobsEnabled && require\.main === module/);
  assert.match(appJs, /if \(inFlight\) return;/);
  assert.match(appJs, /Date\.now\(\) - lastSweepAt >= 60_000/);
});

test('processNextJob recupera trabajos running abandonados', async () => {
  const { jobStore, artifactStore } = createStores();
  const job = enqueue(jobStore);
  jobStore.update(job.id, {
    status: 'running',
    claimToken: 'token-antiguo',
    updatedAt: Date.now() - 1_200_000
  });

  const result = await processNextJob({
    jobStore,
    artifactStore,
    generate: async () => ({ filePath: Buffer.from('%PDF'), fileName: 'deck.pdf', format: 'pdf' })
  });

  assert.equal(result.processed, true);
  assert.equal(result.jobId, job.id);
  assert.equal(jobStore.get(job.id).attempts, 1);
});

test('safeFileName elimina caracteres peligrosos sin dejar nombre vacío', () => {
  assert.equal(safeFileName('../secreto.pdf', 'pdf'), 'secreto.pdf');
  assert.equal(safeFileName('', 'pptx'), 'presentacion.pptx');
  assert.equal(safeFileName('a'.repeat(300), 'pdf').length, 160);
});
