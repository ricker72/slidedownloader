/**
 * Guardas para peticiones salientes hacia URLs que llegan del cliente
 * (proxy de archivos del buscador y descargas de diapositivas).
 *
 * El objetivo es evitar SSRF: no se debe poder usar el servidor para
 * alcanzar localhost, la red interna, metadatos de la nube ni rangos
 * reservados. La comprobación se hace en dos momentos:
 *
 * 1. Sobre el hostname literal (`127.0.0.1`, `[::ffff:127.0.0.1]`, `10.x`…).
 * 2. Sobre la IP real en el momento de conectar, con un `lookup` propio.
 *    Esto último también cubre DNS rebinding y redirecciones.
 */

const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');

// Rangos que nunca deben ser alcanzables desde una URL del usuario.
// net.BlockList compara IPv4 con reglas IPv4 y también resuelve direcciones
// IPv4 mapeadas en IPv6 (::ffff:127.0.0.1).
const BLOCKED_RANGES = new net.BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // privada
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (metadatos 169.254.169.254)
  ['172.16.0.0', 12], // privada
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16], // privada
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4] // reservada / broadcast
]) {
  BLOCKED_RANGES.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['::', 128], // no especificada
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64
  ['100::', 64], // discard-only
  ['2001:db8::', 32], // documentación
  ['2002::', 16], // 6to4
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (obsoleto)
  ['ff00::', 8] // multicast
]) {
  BLOCKED_RANGES.addSubnet(network, prefix, 'ipv6');
}

function normalizeHostname(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

/**
 * ¿Es una IP que no debe alcanzarse? Cualquier valor que no sea una IP
 * válida también se considera bloqueado.
 */
function isBlockedIp(address) {
  const family = net.isIP(String(address || ''));

  if (family === 4) return BLOCKED_RANGES.check(address, 'ipv4');
  if (family === 6) return BLOCKED_RANGES.check(address, 'ipv6');

  return true;
}

/**
 * Comprobación síncrona del hostname: literales IP y nombres locales.
 * Los dominios normales se validan al resolver DNS en `lookupPublic`.
 */
function isBlockedHostname(hostname) {
  const host = normalizeHostname(hostname);

  if (!host) return true;
  if (net.isIP(host)) return isBlockedIp(host);

  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  );
}

function createBlockedError() {
  const error = new Error('La URL apunta a una dirección de red no permitida');
  error.code = 'EBLOCKED';
  error.status = 400;
  return error;
}

function assertPublicHost(hostname) {
  if (isBlockedHostname(hostname)) {
    throw createBlockedError();
  }
}

/**
 * `lookup` para http/https: resuelve el dominio y elige una IP pública.
 * Si DNS cambia entre la comprobación y la conexión, se valida de nuevo aquí.
 */
function lookupPublic(hostname, options, callback) {
  // Node puede pedir todas las direcciones (autoSelectFamily) o una sola.
  const wantsAll = Boolean(options && options.all);

  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);

    const list = Array.isArray(addresses) ? addresses : [];
    const safeList = list.filter((entry) => !isBlockedIp(entry.address));

    if (!safeList.length) return callback(createBlockedError());
    if (wantsAll) return callback(null, safeList);

    return callback(null, safeList[0].address, safeList[0].family);
  });
}

/**
 * Abre una URL pública siguiendo redirecciones de forma manual.
 * Cada salto se valida (protocolo, hostname y, al conectar, IP).
 *
 * @returns {Promise<{ response: import('http').IncomingMessage, request: import('http').ClientRequest, finalUrl: string }>}
 */
function openPublicResponse(
  rawUrl,
  { headers = {}, timeoutMs = 25000, maxRedirects = 5, method = 'GET' } = {}
) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    let settled = false;
    let requestToken = 0;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const attempt = (urlValue, redirectsLeft) => {
      let parsed;

      try {
        parsed = new URL(urlValue);
      } catch (error) {
        return fail(Object.assign(new Error('URL no válida'), { status: 400 }));
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return fail(Object.assign(new Error('Protocolo no permitido'), { status: 400 }));
      }

      try {
        assertPublicHost(parsed.hostname);
      } catch (error) {
        return fail(error);
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return fail(Object.assign(new Error('Tiempo de espera agotado'), { code: 'ETIMEDOUT', status: 504 }));
      }

      const isHttps = parsed.protocol === 'https:';
      const host = normalizeHostname(parsed.hostname);
      const lib = isHttps ? https : http;

      const options = {
        method,
        hostname: host,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        headers,
        lookup: lookupPublic,
        timeout: remaining
      };

      // SNI explícito cuando se conecta por nombre; con IP literal no aplica.
      if (isHttps && net.isIP(host) === 0) {
        options.servername = host;
      }

      const token = (requestToken += 1);

      const request = lib.request(options, (response) => {
        const status = response.statusCode || 0;
        const location = response.headers.location;

        if (status >= 300 && status < 400 && location) {
          response.resume();
          request.setTimeout(0);

          if (redirectsLeft <= 0) {
            request.destroy();
            return fail(Object.assign(new Error('Demasiadas redirecciones'), { status: 502 }));
          }

          let next;
          try {
            next = new URL(location, parsed).href;
          } catch (error) {
            request.destroy();
            return fail(Object.assign(new Error('Redirección no válida'), { status: 502 }));
          }

          return attempt(next, redirectsLeft - 1);
        }

        if (status >= 400) {
          response.resume();
          return fail(Object.assign(new Error(`HTTP ${status}`), { status }));
        }

        if (settled) {
          response.destroy();
          request.destroy();
          return undefined;
        }

        settled = true;
        resolve({ response, request, finalUrl: parsed.href });
        return undefined;
      });

      request.on('timeout', () => {
        if (token !== requestToken || settled) return;
        request.destroy(Object.assign(new Error('Tiempo de espera agotado'), { code: 'ETIMEDOUT' }));
      });

      request.on('error', (error) => {
        if (token === requestToken) fail(error);
      });

      request.end();
      return undefined;
    };

    attempt(rawUrl, maxRedirects);
  });
}

module.exports = {
  BLOCKED_RANGES,
  normalizeHostname,
  isBlockedIp,
  isBlockedHostname,
  assertPublicHost,
  lookupPublic,
  openPublicResponse
};
