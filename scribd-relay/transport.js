/**
 * Transporte HTTPS del relay. Código autocontenido para que `scribd-relay/`
 * pueda desplegarse como servicio independiente en Railway.
 *
 * Usa el mismo perfil TLS que un navegador Chrome, necesario para que Scribd
 * sirva sus vistas públicas en lugar del «Client Challenge».
 */

const https = require('https');
const zlib = require('zlib');

const CHROME_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-RSA-AES128-SHA',
  'ECDHE-RSA-AES256-SHA',
  'AES128-GCM-SHA256',
  'AES256-GCM-SHA384',
  'AES128-SHA',
  'AES256-SHA'
].join(':');

const CHROME_SIGNATURE_ALGORITHMS = [
  'ECDSA+SHA256',
  'RSA-PSS+SHA256',
  'RSA+SHA256',
  'ECDSA+SHA384',
  'RSA-PSS+SHA384',
  'RSA+SHA384',
  'ECDSA+SHA512',
  'RSA-PSS+SHA512',
  'RSA+SHA512'
].join(':');

const TLS_OPTIONS = {
  ciphers: CHROME_CIPHERS,
  ecdhCurve: 'X25519:P-256:P-384',
  sigalgs: CHROME_SIGNATURE_ALGORITHMS,
  minVersion: 'TLSv1.2',
  maxVersion: 'TLSv1.3'
};

function decodeContentEncoding(buffer, encoding, maxBytes) {
  const value = String(encoding || '').trim().toLowerCase();
  if (!value || value === 'identity') return buffer;

  const options = { maxOutputLength: maxBytes + 1 };

  try {
    if (value === 'gzip' || value === 'x-gzip') return zlib.gunzipSync(buffer, options);
    if (value === 'deflate') return zlib.inflateSync(buffer, options);
    if (value === 'br') return zlib.brotliDecompressSync(buffer, options);
  } catch {
    throw Object.assign(new Error('No se pudo descomprimir la respuesta de Scribd.'), { status: 502 });
  }

  throw Object.assign(new Error('Codificación de respuesta no soportada.'), { status: 502 });
}

function createNodeTransport() {
  return function transport(resourceUrl, { headers = {}, maxBytes = 12 * 1024 * 1024, timeoutMs = 20000 } = {}) {
    return new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = new URL(resourceUrl);
      } catch {
        reject(Object.assign(new Error('Recurso no válido.'), { status: 502 }));
        return;
      }

      if (parsed.protocol !== 'https:') {
        reject(Object.assign(new Error('Recurso no permitido.'), { status: 502 }));
        return;
      }

      const request = https.request(
        {
          protocol: 'https:',
          hostname: parsed.hostname,
          port: parsed.port || 443,
          path: `${parsed.pathname}${parsed.search}`,
          method: 'GET',
          headers: { 'Accept-Encoding': 'gzip, deflate, br', ...headers },
          ...TLS_OPTIONS
        },
        (response) => {
          const status = response.statusCode || 0;

          if (status >= 300) {
            response.resume();
            resolve({ status, headers: response.headers, buffer: Buffer.alloc(0) });
            return;
          }

          const declared = Number(response.headers['content-length']);
          if (Number.isFinite(declared) && declared > maxBytes) {
            response.resume();
            reject(Object.assign(new Error('Respuesta demasiado grande.'), { status: 502 }));
            return;
          }

          const chunks = [];
          let total = 0;

          response.on('data', (chunk) => {
            total += chunk.length;
            if (total > maxBytes) {
              request.destroy(Object.assign(new Error('Respuesta demasiado grande.'), { status: 502 }));
              return;
            }
            chunks.push(chunk);
          });

          response.on('end', () => {
            try {
              const buffer = decodeContentEncoding(Buffer.concat(chunks), response.headers['content-encoding'], maxBytes);
              resolve({ status, headers: response.headers, buffer });
            } catch (error) {
              reject(error);
            }
          });

          response.on('error', reject);
        }
      );

      request.setTimeout(timeoutMs, () => {
        const error = new Error('Timeout al pedir el recurso');
        error.code = 'ETIMEDOUT';
        error.status = 504;
        request.destroy(error);
      });
      request.on('error', reject);
      request.end();
    });
  };
}

module.exports = { createNodeTransport };
