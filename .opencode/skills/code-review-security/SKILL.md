---
name: code-review-security
description: Revisión de código centrada en ciberseguridad ofensiva y defensiva: inyección, autenticación y autorización, IDOR, SSRF, XSS, CSRF, secretos, criptografía, deserialización, path traversal, subida de archivos, cabeceras y dependencias. Úsalo siempre que el código maneje entrada de usuario, red, archivos, identidad o secretos, y como parte obligatoria de la Fase 3 del protocolo de desarrollo. Devuelve hallazgos accionables; no modifica código.
---

# Revisión de seguridad

Perspectiva atómica de seguridad. Reporta al skill `code-review` cuando éste esté activo; si se carga de forma aislada, entrega el informe directamente.

## Objetivo

Encontrar vulnerabilidades explotables y proponer parches concretos, sin ruido teórico. Pensar como atacante, reportar como ingeniero.

## Cuándo activarse

- Entrada de usuario (query, body, params, headers, archivos).
- Autenticación, sesiones, tokens, permisos o multi-tenancy.
- Peticiones HTTP salientes, URLs configurables o webhooks (SSRF).
- Lectura/escritura de archivos, rutas o descompresión (path traversal, zip slip).
- Criptografía, hashing, JWT, cookies, CORS, CSP.
- Secretos, claves, credenciales o variables de entorno.
- Dependencias nuevas o desactualizadas.

## Qué revisar

### Inyección

- SQL/NoSQL: concatenación o interpolación de entrada en consultas; uso correcto de parámetros y validación de identifiers.
- Comandos OS: `exec`, `spawn` con `shell: true`, `eval`, plantillas dinámicas.
- Plantillas y expresiones: interpolación en HTML, Markdown, correos o logs.
- Prototype pollution en objetos JavaScript; deserialización insegura (pickle, YAML `load`, `eval`).

### Identidad y acceso

- Autenticación verificada en **cada** endpoint, no solo en el frontend.
- Autorización a nivel de objeto (IDOR): el recurso pertenece al usuario autenticado.
- Escalada de privilegios, roles sin comprobar, cookies sin `HttpOnly`/`Secure`/`SameSite`.
- CSRF en mutaciones con cookies; tokens o `SameSite` adecuado.
- Session fixation, expiración, revocación y rotación de secretos.

### Datos y frontend

- XSS reflejado, almacenado y DOM-based; sanitización y escapado por contexto.
- `innerHTML`, `dangerouslySetInnerHTML`, `v-html`, `document.write`.
- CSP, `HttpOnly`, `Referrer-Policy`, `X-Content-Type-Options`.
- Exposición de PII o stack traces en respuestas, logs o errores de producción.

### Red y servidor

- SSRF: URLs controladas por el usuario sin lista blanca de hosts/IPs; redirecciones sin revalidar; acceso a metadata cloud (169.254.169.254).
- CORS con `*` y credenciales; cabeceras de seguridad ausentes.
- Rate limiting y protección contra fuerza bruta / abuso.
- Timeouts y límites de tamaño en cuerpo, archivos y respuestas.
- Certificados, TLS y verificación de hosts desactivada.

### Archivos y secretos

- Path traversal: `../`, rutas absolutas, `path.join` con entrada sin normalizar.
- Subida de archivos: tipo real vs declarado, tamaño, almacenamiento fuera del webroot, ejecución bloqueada.
- Zip slip en descompresión.
- Secretos en código, tests, logs, URL o mensajes de error. Usar variables de entorno y referencias `{env:...}`.
- Criptografía: MD5/SHA1 para contraseñas, ECB, IVs fijos, comparaciones no constantes, `Math.random()` para tokens.

### Dependencias

- Paquetes nuevos: reputación, mantenimiento, licencia y CVEs conocidos.
- `npm audit` / `pip-audit` / equivalente cuando esté disponible.
- Pinning o rangos excesivamente amplios en producción.

## Método

1. Lee el alcance real: archivos, diff y puntos de entrada.
2. Trazar la entrada de usuario hasta el sink (consultas, comandos, HTML, red, disco).
3. Comprobar cada control en el límite de confianza, no solo su existencia.
4. Para cada sospecha, construir un escenario de explotación mínimo (qué parámetro, qué valor, qué consecuencia).
5. Verificar si hay test que cubra el caso negativo. Si no, proponerlo.
6. Emitir hallazgos con severidad y parche.

## Formato de salida

Un hallazgo por vulnerabilidad:

```markdown
### [CRÍTICO] IDOR en GET /api/orders/:id
- **Ubicación:** `routes/orders.js:42`
- **Evidencia:** `Order.findById(req.params.id)` sin comparar `req.user.id`.
- **Impacto:** cualquier usuario autenticado puede leer pedidos de otros locales con solo cambiar el id.
- **Corrección:** filtrar por `ownerId: req.user.id` (o usar un scope autorizado) y devolver 404 si no coincide.
- **Test:** usuario A intenta leer el pedido de B y recibe 404.
- **CWE:** CWE-639
- **Bloquea merge:** sí
```

## Reglas

- No inventes CVEs ni CWEs: solo inclúyelos si los verificaste.
- No reportes "usa HTTPS" si la app ya está detrás de un proxy TLS correcto.
- Distingue explotable de defensivo: etiqueta la severidad en consecuencia.
- Si el código usa un framework que ya mitiga el riesgo (ORM parametrizado, escape automático), verifícalo antes de reportar.
- Nunca facilites un exploit funcional contra sistemas de terceros: describe el escenario y el parche.

## Criterios de éxito

- Todo hallazgo tiene escenario de explotación concreto y parche.
- No hay falsos positivos por no leer el código circundante.
- Se revisaron autenticación, autorización, entrada, salida y secretos.
- Se indican los tests de seguridad que faltan.
