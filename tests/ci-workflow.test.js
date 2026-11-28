const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(
  path.join(ROOT, '.github', 'workflows', 'tests.yml'),
  'utf8'
);

test('el workflow de CI se ejecuta en cada PR con permisos mínimos', () => {
  assert.match(workflow, /^name: Tests$/m);
  assert.match(workflow, /on:\s*\n\s*pull_request:/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
});

test('el workflow usa acciones oficiales, caché npm y matriz de Node', () => {
  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /cache: npm/);
  assert.match(workflow, /fail-fast: false/);

  for (const version of ['18', '20', '22', '24']) {
    assert.match(workflow, new RegExp(`node: \\[[^\\]]*'${version}'`));
  }
});

test('el workflow instala, verifica y ejecuta la suite completa', () => {
  const commands = [
    'npm ci',
    'node --check server/app.js',
    'node --check public/app.js',
    'git diff --check',
    'npm test'
  ];

  for (const command of commands) {
    assert.ok(workflow.includes(command), `falta el paso: ${command}`);
  }

  assert.match(workflow, /github\.event\.pull_request\.base\.sha/);
  assert.match(workflow, /run: npm test\s*$/m);
});
