const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RECENT_KEY,
  PREFERENCES_KEY,
  MAX_RECENT,
  readRecent,
  addRecent,
  clearRecent,
  readPreference,
  writePreference
} = require('../public/local-state');

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));

  return {
    values,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

function entry(index) {
  return {
    url: `https://www.slideshare.net/slideshow/deck-${index}/${index}`,
    title: `Deck ${index}`,
    format: 'pptx',
    quality: 'hd',
    slideCount: 12,
    fileName: `deck-${index}.pptx`,
    at: 1000 + index
  };
}

test('el historial guarda metadatos, deduce duplicados y respeta el tope', () => {
  const storage = fakeStorage();

  addRecent(entry(1), { storage });
  addRecent(entry(2), { storage });
  addRecent(entry(1), { storage });

  const recent = readRecent({ storage });
  assert.equal(recent.length, 2);
  assert.equal(recent[0].title, 'Deck 1', 'la entrada repetida sube al principio');
  assert.equal(recent[1].title, 'Deck 2');
  assert.equal(JSON.stringify(storage.values.get(RECENT_KEY)).includes('slideCount'), true);

  for (let index = 3; index <= MAX_RECENT + 4; index += 1) {
    addRecent(entry(index), { storage });
  }

  assert.equal(readRecent({ storage }).length, MAX_RECENT);
  assert.deepEqual(clearRecent({ storage }), []);
  assert.equal(readRecent({ storage }).length, 0);
});

test('el historial descarta entradas peligrosas y normaliza campos', () => {
  const storage = fakeStorage({
    [RECENT_KEY]: JSON.stringify([
      { url: 'javascript:alert(1)', title: 'x' },
      { url: 'https://www.slideshare.net/slideshow/ok/9', format: 'exe', quality: '4k' },
      'no es un objeto'
    ])
  });

  const recent = readRecent({ storage });
  assert.equal(recent.length, 1);
  assert.equal(recent[0].format, 'pdf');
  assert.equal(recent[0].quality, 'sd');
  assert.equal(recent[0].title, '');
});

test('las preferencias sobreviven a datos corruptos y a almacenamiento roto', () => {
  const storage = fakeStorage({ [PREFERENCES_KEY]: '{no es json' });

  assert.equal(readPreference('previewLayout', 'grid', { storage }), 'grid');
  assert.equal(writePreference('previewLayout', 'list', { storage }), true);
  assert.equal(readPreference('previewLayout', 'grid', { storage }), 'list');

  const broken = {
    getItem: () => { throw new Error('bloqueado'); },
    setItem: () => { throw new Error('bloqueado'); }
  };

  assert.equal(readPreference('previewLayout', 'grid', { storage: broken }), 'grid');
  assert.equal(writePreference('previewLayout', 'list', { storage: broken }), false);
  assert.deepEqual(readRecent({ storage: broken }), []);
  assert.deepEqual(addRecent(entry(1), { storage: broken }), []);
});
