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

test('un atlas sin recortes se normaliza al tamaño declarado de la página', async () => {
  const markup = '<div class="newpage" id="page1" style="width: 4px; height: 3px"></div>';
  const jsonp = `window.page1_callback(${JSON.stringify([markup])});`;
  const embedHtml = EMBED_HTML.replace('"id":7', '"id":8');
  const transport = async (url) => {
    if (/\/embeds\/8\/content/.test(url) || /\/document_downloads\/8/.test(url)) {
      return { status: 200, headers: {}, buffer: Buffer.from(embedHtml) };
    }
    if (/\/pages\/1-/.test(url)) {
      return { status: 200, headers: {}, buffer: Buffer.from(jsonp) };
    }
    if (/\/images\//.test(url)) {
      const atlas = await sharp({
        create: { width: 20, height: 16, channels: 3, background: '#ff0000' }
      })
        .png()
        .toBuffer();
      return { status: 200, headers: {}, buffer: atlas };
    }
    return { status: 404, headers: {}, buffer: Buffer.alloc(0) };
  };

  const service = createScribdService({ transport });
  const result = await service.download({
    url: 'https://es.scribd.com/document/8/Calidad',
    format: 'pptx',
    quality: 'sd'
  });
  const buffer = fs.readFileSync(result.filePath);
  fs.rmSync(path.dirname(result.filePath), { recursive: true, force: true });

  assert.deepEqual(await imageDimensionsFromOffice(buffer), { width: 4, height: 3 });
});

test('una composición con poca tinta no se sustituye por el atlas completo', async () => {
  const markup = `
    <div class="newpage" id="page1" style="width: 100px; height: 100px">
      <img class="absimg" style="left:45px;top:-50px;width:110px;height:110px;clip:rect(100px 10px 105px 5px)" orig="http://html.scribd.com/abc/images/1-hash.png"/>
    </div>`;
  const jsonp = `window.page1_callback(${JSON.stringify([markup])});`;
  const embedHtml = EMBED_HTML
    .replace('"id":7', '"id":9')
    .replace('origWidth: 4, origHeight: 3', 'origWidth: 100, origHeight: 100');
  const transport = async (url) => {
    if (/\/embeds\/9\/content/.test(url) || /\/document_downloads\/9/.test(url)) {
      return { status: 200, headers: {}, buffer: Buffer.from(embedHtml) };
    }
    if (/\/pages\/1-/.test(url)) {
      return { status: 200, headers: {}, buffer: Buffer.from(jsonp) };
    }
    if (/\/images\//.test(url)) {
      const atlas = await sharp({
        create: { width: 110, height: 110, channels: 3, background: '#ffffff' }
      })
        .composite([
          {
            input: Buffer.from('<svg width="5" height="5"><rect width="5" height="5" fill="#000000"/></svg>'),
            left: 5,
            top: 100
          }
        ])
        .png()
        .toBuffer();
      return { status: 200, headers: {}, buffer: atlas };
    }
    return { status: 404, headers: {}, buffer: Buffer.alloc(0) };
  };

  const service = createScribdService({ transport });
  const result = await service.download({
    url: 'https://es.scribd.com/document/9/Calidad',
    format: 'pptx',
    quality: 'sd'
  });
  const buffer = fs.readFileSync(result.filePath);
  fs.rmSync(path.dirname(result.filePath), { recursive: true, force: true });

  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const media = Object.keys(zip.files).find(
    (name) => /^(?:word|ppt)\/media\//.test(name) && !zip.files[name].dir
  );
  assert.ok(media);
  const image = await zip.file(media).async('nodebuffer');
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 100);
  assert.equal(info.height, 100);

  const pixel = (x, y) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3));
  assert.deepEqual(pixel(52, 52), [0, 0, 0], 'el fragmento debe quedar en el centro');
  assert.deepEqual(pixel(7, 97), [255, 255, 255], 'no debe aparecer la franja del atlas');
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
