/**
 * Relay HTTP para SlideDownloader: realiza los GET a Scribd desde una IP de
 * servidor propio (por ejemplo, Railway) y devuelve la respuesta al backend
 * desplegado en Vercel, que es quien genera el PDF/PPTX/DOCX.
 *
 * Motivo: Scribd sirve un «Client Challenge» a las IPs de centros de datos de
 * Vercel, incluso desde Edge Functions. En local y en alojamiento compartido
 * las vistas públicas responden con normalidad.
 *
 * Seguridad:
 * - Solo acepta URLs https de scribd.com / *.scribd.com / *.scribdassets.com.
 * - Exige `SCRIBD_RELAY_SECRET` mediante `Authorization: Bearer ...`.
 * - No guarda cookies, credenciales ni resultados: solo hace de proxy.
 *
 * Desplegar en Railway/Render/fly.io desde la raíz del repositorio:
 *   start command: node scribd-relay/server.js
 */

const crypto = require('crypto');
const express = require('express');
const { createNodeTransport } = require('../services/scribdService');

const app = express();
const PORT = Number(process.env.PORT) || 3002;
const SECRET = String(process.env.SCRIBD_RELAY_SECRET || '').trim();
const TIMEOUT_MS = Math.max(5000, Number(process.env.SCRIBD_RELAY_TIMEOUT_MS) || 20000);
const MAX_BYTES = 12 * 1024 * 1024;

const SCRIBD_HOST_RE = /^(?:[a-z0-9-]+\.)*scribd\.com$/i;
const ASSET_HOST_RE = /^(?:[a-z0-9-]+\.)*scribdassets\.com$/i;
const ALLOWED_HEADERS = new Set([
  'User-Agent',
  'Accept',
  'Accept-Language',
  'Accept-Encoding',
  'Referer'
]);

const transport = createNodeTransport();

app.disable('x-powered-by');
app.disable('etag');

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function isAuthorized(req) {
  if (!SECRET) return false;
  const header = String(req.headers.authorization || '');
  return safeEqual(header, `Bearer ${SECRET}`);
}

function parseForwardHeaders(value) {
  const result = {};
  if (typeof value !== 'string' || !value) return result;

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return result;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return result;

  for (const [name, headerValue] of Object.entries(parsed)) {
    if (!ALLOWED_HEADERS.has(name)) continue;
    if (typeof headerValue !== 'string') continue;
    result[name] = headerValue.slice(0, 2000);
  }

  return result;
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'scribd-relay',
    configured: Boolean(SECRET),
    timeoutMs: TIMEOUT_MS
  });
});

app.get('/fetch', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(SECRET ? 401 : 503).json({
      error: SECRET ? 'No autorizado' : 'SCRIBD_RELAY_SECRET no configurado'
    });
  }

  const rawUrl = req.query.url;
  if (typeof rawUrl !== 'string' || !rawUrl) {
    return res.status(400).json({ error: 'Se requiere el parámetro url' });
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'URL no válida' });
  }

  if (parsed.protocol !== 'https:' || !(SCRIBD_HOST_RE.test(parsed.hostname) || ASSET_HOST_RE.test(parsed.hostname))) {
    return res.status(400).json({ error: 'Host no permitido' });
  }

  try {
    const result = await transport(parsed.href, {
      headers: parseForwardHeaders(req.headers['x-scribd-headers']),
      maxBytes: MAX_BYTES,
      timeoutMs: TIMEOUT_MS
    });

    // El transporte ya descomprime la respuesta; no propagamos content-encoding
    // ni content-length para que el cliente no intente descomprimirla dos veces.
    const upstreamHeaders = {};
    if (result.headers.location) upstreamHeaders.location = result.headers.location;
    if (result.headers['content-type']) upstreamHeaders['content-type'] = result.headers['content-type'];

    res.set('X-Upstream-Status', String(result.status || 0));
    res.set('X-Upstream-Headers', JSON.stringify(upstreamHeaders));
    res.type('application/octet-stream');
    return res.status(200).send(result.buffer);
  } catch (error) {
    const status = Number(error && error.status) || 502;
    console.error('[scribd-relay] Error al pedir', parsed.href, error && error.message ? error.message : error);
    return res.status(status >= 500 ? 502 : status).json({
      error: 'No se pudo obtener el recurso de Scribd'
    });
  }
});

app.listen(PORT, () => {
  console.log(`[scribd-relay] escuchando en puerto ${PORT}`);
  if (!SECRET) {
    console.error('[scribd-relay] SCRIBD_RELAY_SECRET no configurado: /fetch responderá 503.');
  }
});
