const params = new URLSearchParams(location.search);
const titleElement = document.getElementById('preview-title');
const formatElement = document.getElementById('preview-format');
const domainElement = document.getElementById('preview-domain');
const frame = document.getElementById('preview-frame');
const loading = document.getElementById('preview-loading');
const message = document.getElementById('preview-message');
const sourceLink = document.getElementById('preview-source');
const downloadLink = document.getElementById('preview-download');
const allowedFormats = new Set(['ppt', 'pptx', 'pdf']);

function isPublicHttpUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const isPrivateIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
      && hostname.split('.').map(Number).some((part, index) => (
        (index === 0 && (part === 0 || part === 10 || part === 127 || part >= 224))
        || (index === 0 && part === 169 && Number(hostname.split('.')[1]) === 254)
        || (index === 0 && part === 192 && Number(hostname.split('.')[1]) === 168)
        || (index === 0 && part === 172 && Number(hostname.split('.')[1]) >= 16 && Number(hostname.split('.')[1]) <= 31)
      ));

    return ['http:', 'https:'].includes(url.protocol)
      && !url.username
      && !url.password
      && hostname !== 'localhost'
      && !hostname.endsWith('.localhost')
      && !hostname.endsWith('.local')
      && !hostname.endsWith('.internal')
      && hostname !== '::1'
      && !/^f[cd][0-9a-f]{2}:/i.test(hostname)
      && !/^fe80:/i.test(hostname)
      && !isPrivateIpv4
      ? url
      : null;
  } catch {
    return null;
  }
}

function showError(text) {
  loading.hidden = true;
  frame.hidden = true;
  message.textContent = text;
  message.hidden = false;
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const sourceUrl = isPublicHttpUrl(params.get('url') || '');
const actualFormat = sourceUrl?.pathname.toLowerCase().match(/\.(pptx?|pdf)$/)?.[1] || '';

if (!sourceUrl || !allowedFormats.has(actualFormat)) {
  titleElement.textContent = 'Documento no válido';
  formatElement.textContent = 'Vista previa no disponible';
  showError('El enlace no corresponde a un archivo público PPT, PPTX o PDF.');
} else {
  const pathFileName = decodePathSegment(sourceUrl.pathname.split('/').pop() || 'Documento');
  const title = params.get('title')?.trim() || pathFileName;
  const fileName = params.get('fileName')?.trim() || pathFileName;

  titleElement.textContent = title;
  formatElement.textContent = actualFormat.toUpperCase();
  domainElement.textContent = sourceUrl.hostname;
  document.title = `${title} — Vista previa`;

  sourceLink.href = sourceUrl.href;
  sourceLink.hidden = false;
  downloadLink.href = `/api/file?url=${encodeURIComponent(sourceUrl.href)}`;
  downloadLink.download = fileName;
  downloadLink.hidden = false;

  frame.src = actualFormat === 'pdf'
    ? `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(sourceUrl.href)}`
    : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sourceUrl.href)}`;
  frame.hidden = false;

  const loadTimeout = setTimeout(() => {
    if (!frame.dataset.loaded) {
      loading.hidden = true;
      message.textContent = 'El visor externo no pudo cargar el documento. Puedes abrir el archivo original o descargarlo.';
      message.hidden = false;
    }
  }, 15000);

  frame.addEventListener('load', () => {
    frame.dataset.loaded = 'true';
    clearTimeout(loadTimeout);
    loading.hidden = true;
  }, { once: true });

  downloadLink.addEventListener('click', () => {
    message.textContent = 'Iniciando descarga…';
    message.hidden = false;
  });
}
