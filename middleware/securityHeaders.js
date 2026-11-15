/**
 * Middleware de headers de seguridad para SlideDownloader.
 *
 * Establece cabeceras que reducen la superficie de ataque:
 * - X-Content-Type-Options: evita MIME-sniffing en el navegador.
 * - X-Frame-Options: DENY por defecto (el iframe de preview se gestiona con sandbox).
 * - Referrer-Policy: limita información enviada en cabeceras Referer.
 * - Permissions-Policy: desactiva sensores y APIs del dispositivo.
 * - Strict-Transport-Security: fuerza HTTPS (solo en producción/HTTPS).
 * - X-DNS-Prefetch-Control: desactiva prefetch de DNS.
 */

function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );
  res.set('X-DNS-Prefetch-Control', 'off');

  // Solo forzar HSTS si la conexión es HTTPS o está detrás de proxy HTTPS.
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  next();
}

module.exports = {
  securityHeaders
};