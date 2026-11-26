const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const {
  hashToken,
  safeTokenEqual,
  toPublicJob,
  MemoryJobStore
} = require('../services/jobStore');
const { MemoryArtifactStore, normalizeKey } = require('../services/artifactStore');

function makeJobPayload() {
  return {
    id: randomUUID(),
    tokenHash: hashToken('token-secreto'),
    payload: { url: 'https://www.slideshare.net/slideshow/ejemplo/12345678', format: 'pdf', quality: 'sd' }
  };
}

test('MemoryJobStore crea, actualiza y aísla el payload interno', () => {
  const store = new MemoryJobStore();
  const input = makeJobPayload();
  const job = store.create(input);

  input.payload.url = 'modificada';
  assert.notEqual(job.payload.url, 'modificada');
  assert.equal(job.status, 'queued');

  const updated = store.update(job.id, { status: 'done', progress: 100 });
  assert.equal(updated.status, 'done');
  assert.equal(updated.progress, 100);
  assert.equal(updated.attempts, 0);
  assert.equal(store.get(job.id).payload.url, job.payload.url);
});

test('claimNext entrega un trabajo una sola vez y regenera el token', () => {
  const store = new MemoryJobStore();
  const job = store.create(makeJobPayload());

  const claim = store.claimNext('worker-1');
  assert.equal(claim.job.id, job.id);
  assert.equal(claim.job.status, 'running');
  assert.equal(claim.job.attempts, 1);
  assert.equal(store.claimNext('worker-2'), null);
  assert.equal(store.get(job.id).claimToken, claim.claimToken);
});

test('listStaleRunning detecta reclamaciones caducadas y deleteExpired aplica TTL', () => {
  const store = new MemoryJobStore();
  const fresh = store.create(makeJobPayload());
  const stale = store.create({ ...makeJobPayload(), createdAt: Date.now() - 10_000 });

  store.claimNext('worker-1');
  store.update(stale.id, { status: 'running', updatedAt: Date.now() - 10_000 });

  const staleJobs = store.listStaleRunning(5_000);
  assert.deepEqual(staleJobs.map((item) => item.id), [stale.id]);
  assert.equal(store.get(fresh.id).status, 'running');

  const expired = store.create({ ...makeJobPayload(), expiresAt: Date.now() - 1 });
  const live = store.create(makeJobPayload());

  assert.equal(store.deleteExpired(), 1);
  assert.equal(store.get(expired.id), null);
  assert.ok(store.get(live.id));
});

test('safeTokenEqual compara en tiempo constante y toPublicJob oculta secretos', () => {
  const tokenHash = hashToken('token-secreto');

  assert.equal(safeTokenEqual(tokenHash, 'token-secreto'), true);
  assert.equal(safeTokenEqual(tokenHash, 'otro-token'), false);
  assert.equal(safeTokenEqual('', 'token-secreto'), false);

  const job = new MemoryJobStore().create({
    ...makeJobPayload(),
    status: 'done',
    result: { fileName: 'deck.pdf', title: 'Deck', format: 'pdf', quality: 'sd', slideCount: 10 }
  });
  const publicJob = toPublicJob(job);

  assert.deepEqual(Object.keys(publicJob).sort(), [
    'createdAt', 'id', 'progress', 'result', 'status', 'updatedAt'
  ]);
  assert.equal(publicJob.result.fileName, 'deck.pdf');
  assert.equal(JSON.stringify(publicJob).includes('tokenHash'), false);
  assert.equal(JSON.stringify(publicJob).includes('slideshare.net'), false);
});

test('MemoryArtifactStore guarda, sirve y borra artefactos sin rutas relativas', async () => {
  const store = new MemoryArtifactStore();
  const jobId = randomUUID();
  const key = `jobs/${jobId}/deck.pdf`;
  const stored = await store.put(key, Buffer.from('%PDF-1.4'), {
    contentType: 'application/pdf'
  });

  assert.equal(stored.key, key);
  assert.equal(stored.size, 8);
  assert.equal((await store.get(stored.key)).toString(), '%PDF-1.4');
  assert.equal(await store.getContentType(stored.key), 'application/pdf');
  assert.ok(store.objects.get(stored.key).expiresAt > Date.now());

  assert.equal(await store.delete(stored.key), true);
  assert.equal(await store.get(stored.key), null);
  assert.throws(() => normalizeKey('../secreto'), /Clave de artefacto inválida/);
  assert.throws(() => normalizeKey('jobs\\secreto'), /Clave de artefacto inválida/);
});

test('MemoryArtifactStore no sirve artefactos caducados y deleteExpired los retira', async () => {
  const store = new MemoryArtifactStore();
  const expiredKey = `jobs/${randomUUID()}/viejo.pdf`;
  const liveKey = `jobs/${randomUUID()}/vivo.pdf`;

  await store.put(expiredKey, Buffer.from('viejo'));
  await store.put(liveKey, Buffer.from('vivo'));
  store.objects.get(expiredKey).expiresAt = Date.now() - 1;

  assert.equal(await store.get(expiredKey), null);
  assert.equal(store.objects.has(expiredKey), false);
  assert.equal(await store.deleteExpired(), 0);

  store.objects.get(liveKey).expiresAt = Date.now() - 1;
  assert.equal(await store.deleteExpired(), 1);
  assert.equal(await store.get(liveKey), null);
});
