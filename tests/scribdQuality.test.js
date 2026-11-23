const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const { createScribdService, compactImagesToBudget } = require('../services/scribdService');

const ATLAS_MARKUP = `
<div class="newpage" id="page1" style="width: 4px; height: 3px">
  <img class="absimg" style="left:0px;top:0px;width:8px;height:6px;clip:rect(0px 4px 3px 0px)" orig="http://html.scribd.com/abc/images/1-hash.png"/>
</div>`;
const JSONP = `window.page1_callback(${JSON.stringify([ATLAS_MARKUP])});`;

const EMBED_HTML = `<!doctype html><html><body><script>
new Scribd.EmbedsShow({"document":{"id":7,"title":"Calidad","page_count":1},"toolbar":{"downloadable":true}});
docManager.addPage({ pageNum: 1, origWidth: 4, origHeight: 3, contentUrl: "https://html.scribdassets.com/abc/pages/1-hash.jsonp" });
</script></body></html>`;

function fakeTransport() {
  return async (url) => {
    if (/\/embeds\/7\/content/.test(url) || /\/document_downloads\/7/.test(url)) {
      return { status: 200, headers: {}, buffer: Buffer.from(EMBED_HTML) };
    }
    if (/\/pages\/1-/.test(url)) {
      return { status: 200, headers: {}, buffer: Buffer.from(JSONP) };
    }
    if (/\/images\//.test(url)) {
      const atlas = await sharp({
        create: { width: 8, height: 6, channels: 3, background: '#ff0000' }
      })
        .png()
        .toBuffer();
      return { status: 200, headers: {}, buffer: atlas };
    }
    return { status: 404, headers: {}, buffer: Buffer.alloc(0) };
  };
}

async function imageDimensionsFromOffice(buffer) {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const media = Object.keys(zip.files).find(
    (name) => /^(?:word|ppt)\/media\//.test(name) && !zip.files[name].dir
  );
  assert.ok(media, 'el archivo debe incluir una imagen');
  const metadata = await sharp(await zip.file(media).async('nodebuffer')).metadata();
  return { width: metadata.width, height: metadata.height };
}

async function generate(format, quality) {
  const service = createScribdService({ transport: fakeTransport() });
  const result = await service.download({
    url: 'https://es.scribd.com/document/7/Calidad',
    format,
    ...(quality ? { quality } : {})
  });
  const buffer = fs.readFileSync(result.filePath);
  fs.rmSync(path.dirname(result.filePath), { recursive: true, force: true });
  return buffer;
}

test('la descarga usa HD por defecto en todos los formatos', async () => {
  for (const format of ['pdf', 'pptx', 'ppsx', 'potx', 'docx']) {
    const buffer = await generate(format);

    if (format === 'pdf') {
      assert.match(buffer.toString('latin1'), /\/Width 8\b/, `${format}: ancho HD`);
      assert.match(buffer.toString('latin1'), /\/Height 6\b/, `${format}: alto HD`);
    } else {
      const size = await imageDimensionsFromOffice(buffer);
      assert.deepEqual(size, { width: 8, height: 6 }, `${format}: tamaño HD`);
    }
  }
});

test('la calidad SD conserva la resolución original', async () => {
  const buffer = await generate('pptx', 'sd');
  assert.deepEqual(await imageDimensionsFromOffice(buffer), { width: 4, height: 3 });
});

test('se rechaza una calidad desconocida', async () => {
  const service = createScribdService({ transport: fakeTransport() });
  await assert.rejects(
    () =>
      service.download({
        url: 'https://es.scribd.com/document/7/Calidad',
        format: 'pdf',
        quality: 'ultra'
      }),
    (error) => error.status === 400
  );
});

test('el formulario de Scribd ofrece HD marcada por defecto', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'scribd.html'), 'utf8');
  assert.match(html, /name="scribd-quality" value="hd" checked/);
  assert.match(html, /name="scribd-quality" value="sd"/);

  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'scribd.js'), 'utf8');
  assert.match(script, /name="scribd-quality"\]:checked/);
  assert.match(script, /format, quality/);

  const home = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(home, /name="quality" value="hd" checked/);
});

function noiseImage(width, height) {
  const raw = Buffer.alloc(width * height * 3);
  for (let index = 0; index < raw.length; index += 1) {
    raw[index] = Math.floor(Math.random() * 256);
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

test('la compactación mantiene el archivo dentro del presupuesto de Vercel', async () => {
  const images = [];
  for (let index = 0; index < 3; index += 1) {
    images.push({
      pageNum: index + 1,
      mime: 'image/jpeg',
      buffer: await noiseImage(400, 225)
    });
  }

  const original = images.reduce((sum, item) => sum + item.buffer.length, 0);
  const budget = Math.floor(original / 3);
  const compacted = await compactImagesToBudget(images, budget);

  const size = compacted.reduce((sum, item) => sum + item.buffer.length, 0);

  assert.equal(compacted.length, images.length);
  assert.ok(size <= budget, `esperaba <= ${budget} bytes, obtuve ${size}`);
  assert.ok(compacted.every((item) => item.mime === 'image/jpeg'));
});

test('sin presupuesto o por debajo del tope no se recomprime nada', async () => {
  const buffer = await noiseImage(40, 30);
  const images = [{ pageNum: 1, mime: 'image/jpeg', buffer }];

  assert.equal(await compactImagesToBudget(images, 0), images);
  assert.equal(await compactImagesToBudget(images, buffer.length + 1024), images);
});
