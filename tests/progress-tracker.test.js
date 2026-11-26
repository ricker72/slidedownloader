const test = require('node:test');
const assert = require('node:assert/strict');

const { ProgressTracker, progressPercent } = require('../services/progressTracker');

const ID = '11111111-1111-4111-8111-111111111111';

test('progressPercent traduce cada etapa a un avance monótono', () => {
  assert.equal(progressPercent({ stage: 'preparing' }), 5);
  assert.equal(progressPercent({ stage: 'analyzing' }), 10);
  assert.equal(progressPercent({ stage: 'downloading-images', current: 0, total: 4 }), 10);
  assert.equal(progressPercent({ stage: 'downloading-images', current: 2, total: 4 }), 48);
  assert.equal(progressPercent({ stage: 'downloading-images', current: 4, total: 4 }), 85);
  assert.equal(progressPercent({ stage: 'generating-file' }), 90);
  assert.equal(progressPercent({ stage: 'done' }), 100);
  assert.equal(progressPercent({ stage: 'failed' }), 100);
});

test('el registro publica etapas y contadores sin filtrar URLs', () => {
  const tracker = new ProgressTracker();
  const report = tracker.create(ID, { format: 'pptx', quality: 'hd' });

  assert.deepEqual(tracker.get(ID), {
    stage: 'preparing',
    current: 0,
    total: null,
    failed: 0,
    format: 'pptx',
    quality: 'hd',
    percent: 5,
    updatedAt: tracker.get(ID).updatedAt
  });

  report({ stage: 'downloading-images', current: 3, total: 10, failedUrl: 'secreto' });
  const progress = tracker.get(ID);

  assert.equal(progress.stage, 'downloading-images');
  assert.equal(progress.current, 3);
  assert.equal(progress.total, 10);
  assert.equal(progress.percent, 33);
  assert.doesNotMatch(JSON.stringify(progress), /secreto/);

  report({ stage: 'generating-file' });
  assert.equal(tracker.get(ID).percent, 90);
});

test('los campos de texto están acotados para no amplificar el sondeo', () => {
  const tracker = new ProgressTracker();
  const report = tracker.create(ID, { format: 'x'.repeat(200), quality: 'y'.repeat(200) });

  assert.equal(tracker.get(ID).format.length, 16);
  assert.equal(tracker.get(ID).quality.length, 16);

  report({ stage: 'generating-file', format: 'z'.repeat(200) });
  assert.equal(tracker.get(ID).format.length, 16);
});

test('las sesiones caducan y el número de sesiones está acotado', () => {
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  try {
    const tracker = new ProgressTracker({ ttlMs: 5000, maxSessions: 2 });
    tracker.create(ID);
    now += 6000;
    assert.equal(tracker.get(ID), null);

    tracker.create(ID);
    tracker.create('22222222-2222-4222-8222-222222222222');
    tracker.create('33333333-3333-4333-8333-333333333333');

    assert.equal(tracker.sessions.size, 2);
    assert.equal(tracker.get(ID), null);
  } finally {
    Date.now = originalNow;
  }
});
