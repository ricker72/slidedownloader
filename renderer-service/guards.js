/**
 * Guardas del renderizador externo.
 *
 * El servicio abre un navegador real, así que solo debe aceptar enlaces de
 * SlideShare y no debe permitir que una página alcance la red interna del
 * contenedor (SSRF).
 */

const net = require('net');

const BLOCKED_RANGES = new net.BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
]) {
  BLOCKED_RANGES.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8]
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

function isBlockedHost(hostname) {
  const host = normalizeHostname(hostname);

  if (!host) return true;

  const family = net.isIP(host);
  if (family === 4) return BLOCKED_RANGES.check(host, 'ipv4');
  if (family === 6) return BLOCKED_RANGES.check(host, 'ipv6');

  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  );
}

/**
 * Solo URLs públicas de slideshare.net, sin credenciales ni puertos raros.
 * Devuelve la URL normalizada (https) o null.
 */
function normalizeSlideshareUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;

  const value = rawUrl.trim();
  if (!value || value.length > 2048) return null;

  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch (error) {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port) return null;
  if (isBlockedHost(parsed.hostname)) return null;

  const hostname = normalizeHostname(parsed.hostname);
  if (hostname !== 'slideshare.net' && !hostname.endsWith('.slideshare.net')) return null;

  parsed.protocol = 'https:';
  parsed.hash = '';
  return parsed.href;
}

module.exports = {
  normalizeHostname,
  isBlockedHost,
  normalizeSlideshareUrl
};
