const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const PptxGenJS = require('pptxgenjs');
const { Document, Packer, Paragraph, HeadingLevel, TextRun, ImageRun } = require('docx');
const { DEFAULT_TITLE, SUPPORTED_FORMATS } = require('../../config');
const { ERROR_CODES, createServiceError } = require('../errors');
const { sanitizeFileName } = require('./slideUtils');
const {
  downloadImagesConcurrently,
  detectImageMime,
  toDataUri,
  getImageDimensions,
  fitImageWithinBox
} = require('./imageDownload');

const PPTX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml';
const PPTX_VARIANTS = {
  ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml',
  potx: 'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml'
};

// SlideShare publica cada diapositiva en varias "carpetas de calidad":
//   /75/ → 2048 px (máxima), /95/ → 1024 px, /85/ → 638/320 px.

async function createPdfFromImages(imageUrls, outputPath, title, quality = 'sd', onProgress = null) {
  const downloaded = await downloadImagesConcurrently(imageUrls, quality, undefined, undefined, onProgress);
  if (typeof onProgress === 'function') onProgress({ stage: 'generating-file' });
  const validImages = [];

  // pdfkit solo admite PNG y JPEG.
  for (const { url, buffer, mime } of downloaded) {
    if (mime !== 'image/png' && mime !== 'image/jpeg') {
      console.warn(`Imagen omitida en PDF (${mime || 'formato desconocido'}): ${url}`);
      continue;
    }

    validImages.push(buffer);
  }

  const pdf = new PDFDocument({ size: 'A4', margin: 20 });
  const stream = fs.createWriteStream(outputPath);
  pdf.pipe(stream);

  if (!validImages.length) {
    pdf.fontSize(18).text(title || DEFAULT_TITLE, { align: 'center' });
    pdf.moveDown();
    pdf.fontSize(12).text('No se encontraron imágenes válidas para generar este documento.', { align: 'center' });
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
      pdf.end();
    });
    return;
  }

  for (let index = 0; index < validImages.length; index += 1) {
    const buffer = validImages[index];
    if (index > 0) pdf.addPage();
    pdf.image(buffer, 20, 20, { fit: [pdf.page.width - 40, pdf.page.height - 60], align: 'center', valign: 'center' });
  }

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
    pdf.end();
  });
}

const PPTX_IMAGE_BOX = { x: 0.5, y: 0.8, w: 12.33, h: 6.5 };
const DOCX_IMAGE_BOX = { x: 0, y: 0, w: 500, h: 300 };

async function createPptxFromImages(imageUrls, outputPath, title, quality = 'sd', onProgress = null) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'SlideDownloader';
  pptx.company = 'SlideDownloader';
  pptx.subject = 'Presentation export';
  pptx.title = title || DEFAULT_TITLE;

  const downloaded = await downloadImagesConcurrently(imageUrls, quality, undefined, undefined, onProgress);
  if (typeof onProgress === 'function') onProgress({ stage: 'generating-file' });
  const validImages = [];

  // pptxgenjs + PowerPoint admiten de forma fiable PNG y JPEG.
  for (const { url, buffer, mime, width, height } of downloaded) {
    if (mime !== 'image/png' && mime !== 'image/jpeg') {
      console.warn(`Imagen omitida en PPTX (${mime || 'formato desconocido'}): ${url}`);
      continue;
    }

    validImages.push({ url, buffer, mime, width, height });
  }

  if (!validImages.length) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addText(title || DEFAULT_TITLE, { x: 0.5, y: 0.5, w: 12, h: 0.5, fontSize: 24, bold: true, color: '000000' });
    slide.addText('No se encontraron imágenes válidas para generar la presentación.', {
      x: 0.5,
      y: 1.5,
      w: 12,
      h: 1,
      fontSize: 16,
      color: '333333'
    });
    await pptx.writeFile({ fileName: outputPath });
    return;
  }

  for (const { buffer, mime, width, height } of validImages) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addText(title || DEFAULT_TITLE, { x: 0.5, y: 0.2, w: 12, h: 0.5, fontSize: 18, bold: true, color: '111827' });

    // Insertar con la proporción real de la imagen, centrada en la caja.
    // Antes se usaba 12.8×6.8 fijo y los mazos 4:3 salían estirados.
    const placement = fitImageWithinBox(width, height, PPTX_IMAGE_BOX);
    slide.addImage({
      data: toDataUri(buffer, mime),
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h
    });
  }

  await pptx.writeFile({ fileName: outputPath });
}

async function createDocxFromImages(imageUrls, outputPath, title, quality = 'sd', onProgress = null) {
  const children = [
    new Paragraph({
      text: title || DEFAULT_TITLE,
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 }
    })
  ];

  const downloaded = await downloadImagesConcurrently(imageUrls, quality, undefined, undefined, onProgress);
  if (typeof onProgress === 'function') onProgress({ stage: 'generating-file' });
  const validImages = [];

  // docx solo admite imágenes PNG y JPEG de forma fiable.
  for (const { url, buffer, mime, width, height } of downloaded) {
    if (mime !== 'image/png' && mime !== 'image/jpeg') {
      console.warn(`Imagen omitida en DOCX (${mime || 'formato desconocido'}): ${url}`);
      continue;
    }

    validImages.push({ url, buffer, mime, width, height });
  }

  for (let index = 0; index < validImages.length; index += 1) {
    const item = validImages[index];
    const placement = fitImageWithinBox(item.width, item.height, DOCX_IMAGE_BOX);

    children.push(new Paragraph({ text: `Slide ${index + 1}`, heading: HeadingLevel.HEADING_2, spacing: { before: 120, after: 120 } }));
    children.push(new Paragraph({
      children: [
        new ImageRun({
          data: item.buffer,
          transformation: {
            width: Math.max(1, Math.round(placement.w)),
            height: Math.max(1, Math.round(placement.h))
          }
        })
      ],
      spacing: { after: 200 }
    }));
  }

  if (!validImages.length) {
    children.push(new Paragraph({ text: 'No se encontraron imágenes válidas para generar el documento.', spacing: { after: 200 } }));
  }

  const doc = new Document({
    sections: [{ properties: {}, children }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

/**
 * Convertir un PPTX en PPSX o POTX. El paquete es idéntico salvo el tipo
 * de contenido declarado para `ppt/presentation.xml`.
 */
async function convertPptxToVariant(pptxPath, outputPath, variant) {
  const targetContentType = PPTX_VARIANTS[variant];

  if (!targetContentType) {
    throw new Error(`Variante de PowerPoint no soportada: ${variant}`);
  }

  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath));
  const contentTypes = zip.file('[Content_Types].xml');

  if (!contentTypes) {
    throw new Error('El PPTX generado no contiene [Content_Types].xml');
  }

  const xml = await contentTypes.async('string');

  if (!xml.includes(PPTX_CONTENT_TYPE)) {
    throw new Error('El tipo de contenido del PPTX generado no es el esperado');
  }

  zip.file('[Content_Types].xml', xml.split(PPTX_CONTENT_TYPE).join(targetContentType));

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(outputPath, buffer);
}

async function buildPresentationFileFromImages(imageUrls, format, outputDir, title, quality = 'sd', onProgress = null) {
  const extension = String(format || 'pdf').toLowerCase();

  if (!SUPPORTED_FORMATS.includes(extension)) {
    throw createServiceError(`Formato no soportado: ${format}`, 400, ERROR_CODES.UNSUPPORTED_FORMAT);
  }

  const outputFile = path.join(outputDir, sanitizeFileName(title || DEFAULT_TITLE, extension));

  if (extension === 'pdf') {
    await createPdfFromImages(imageUrls, outputFile, title, quality, onProgress);
  } else if (extension === 'pptx') {
    await createPptxFromImages(imageUrls, outputFile, title, quality, onProgress);
  } else if (extension === 'docx') {
    await createDocxFromImages(imageUrls, outputFile, title, quality, onProgress);
  } else {
    // PPSX y POTX: se genera un PPTX temporal y se cambia su tipo de contenido.
    const tempPptx = path.join(outputDir, `.__tmp-${Date.now()}-${process.pid}.pptx`);

    try {
      await createPptxFromImages(imageUrls, tempPptx, title, quality, onProgress);
      await convertPptxToVariant(tempPptx, outputFile, extension);
    } finally {
      fs.rmSync(tempPptx, { force: true });
    }
  }

  return { outputFile, filename: path.basename(outputFile) };
}

module.exports = {
  createPdfFromImages,
  createPptxFromImages,
  createDocxFromImages,
  convertPptxToVariant,
  buildPresentationFileFromImages
};
