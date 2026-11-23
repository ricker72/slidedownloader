---
name: secure-coding
description: Escribe código seguro desde la primera línea en web, backend, videojuegos y sistemas (Windows, Linux, Android): valida entradas, protege autenticación y autorización, evita inyecciones, SSRF, XSS, path traversal, secretos y crypto débil, y define controles antes de implementar. Úsalo ANTES de escribir o modificar código que maneje entrada de usuario, red, archivos, identidad, credenciales, comandos del SO o datos de jugadores. Complementa a code-review-security, que revisa después.
---

# Escritura segura de código

Entregable: código nuevo con los controles de seguridad ya aplicados y verificables, no un parche posterior. Se carga **antes de escribir**; `code-review-security` se carga después para auditar.

## Cuándo usarlo

- Cualquier handler HTTP, CLI, script o tool que reciba datos de fuera del proceso.
- Autenticación, sesiones, tokens, roles o datos de otros usuarios.
- Peticiones salientes, URLs configurables, webhooks o subida de archivos.
- Lectura/escritura de rutas, descompresión, ejecución de procesos.
- Criptografía, JWT, cookies, CORS, CSP o secretos.
- Videojuegos: guardados, multiplayer, puntuaciones, mods, trampas y econometría.
- Android/Windows/Linux: permisos, almacenamiento, servicios, deep links y elevación.

## Reglas de oro

1. **Validar en el límite, confiar dentro.** Todo dato externo se valida al entrar: tipo, longitud, rango, formato y lista blanca.
2. **Nunca concatenar datos en comandos, consultas, rutas ni HTML.** Parámetros, placeholders y escapado por contexto.
3. **Autorizar cada objeto, no solo la ruta.** Saber quién es el usuario no basta: comprobar que el recurso es suyo.
4. **Menor privilegio por defecto.** Permisos, scopes, puertos, rutas y timeouts mínimos.
5. **Los secretos nunca en el código.** Variables de entorno o gestor de secretos; rotación documentada.
6. **Fallar de forma segura y honesta.** Errores concretos al llamador, sin stack traces ni datos sensibles; denegar por defecto.
7. **Diseñar para auditar.** Logs estructurados sin secretos, correlación de peticiones y acciones sensibles registradas.

## Controles por dominio

### Web y backend

- Consultas parametrizadas; los nombres de columnas/tablas solo de listas fijas.
- Escapado automático de plantillas; `innerHTML`/`dangerouslySetInnerHTML` solo con sanitizador explícito.
- Cookies de sesión `HttpOnly`, `Secure`, `SameSite`; CSRF en mutaciones con cookies.
- CORS con orígenes explícitos; cabeceras `X-Content-Type-Options`, `Referrer-Policy` y CSP.
- Rate limiting y límites de tamaño de cuerpo y respuesta; timeouts en toda E/S.
- URLs salientes: lista blanca de hosts, bloqueo de rangos privados y metadata cloud, revalidar redirecciones.
- Archivos: tipo real verificado, tamaño máximo, almacenamiento fuera del webroot, nombres generados, sin ejecución.

### Ciberseguridad ofensiva/defensiva

- Trabajar solo en sistemas propios o con autorización por escrito.
- No incluir exploits funcionales contra terceros: describir escenario, impacto y parche.
- Amenazas a considerar: inyección, IDOR, SSRF, XSS, CSRF, deserialización, path traversal, zip slip, prototipo contaminado.
- No usar MD5/SHA1 para contraseñas, ECB, IV fijo, `Math.random()` para tokens ni comparaciones no constantes.

### Videojuegos

- El cliente nunca es autoridad: validar puntuaciones, inventario, daño y economía en el servidor.
- Firmar o verificar guardados; no deserializar datos del jugador sin esquema y límites.
- Anti-trampa sin confiar en ofuscación; registrar eventos sospechosos con correlación.
- Limitar mensajes de red, tasas y tamaño de payload; prevenir `speed hacking` y floods.

### Sistemas (Android / Windows / Linux)

- Android: permisos mínimos, `Scoped Storage`, deep links validados, no exportar componentes innecesarios, certificados verificados.
- Windows/Linux: rutas absolutas normalizadas, sin `shell: true` con entrada del usuario, sin elevación implícita, servicios con cuenta de menor privilegio.
- Scripts: comandos con argumentos separados, sin interpolación en shell, timeouts y manejo explícito de errores.

## Antes de escribir

- [ ] ¿Identifiqué todos los puntos de entrada y sus límites de confianza?
- [ ] ¿Definí esquemas/listas blancas para cada entrada?
- [ ] ¿La autorización se comprueba a nivel de recurso?
- [ ] ¿Los secretos vienen de entorno y no del código?
- [ ] ¿Hay timeouts, límites de tamaño y logging sin datos sensibles?
- [ ] ¿El diseño evita ejecutar comandos, rutas relativas sin normalizar y redirecciones sin validar?

## Después de escribir

- Cargar `code-review-security` y aplicar sus hallazgos **`archivo:línea`**.
- Añadir tests negativos: entrada inválida, usuario sin permiso, URL no permitida, archivo malicioso.
- Ejecutar linter, análisis estático y `npm audit`/equivalente si hay dependencias nuevas.
- Repetir la auditoría hasta que no queden hallazgos bloqueantes.

## Criterios de éxito

- No hay entradas sin validar ni sinks (SQL, shell, HTML, red, disco) alimentados directamente por datos externos.
- Toda mutación sensible está autorizada y registrada.
- Los tests cubren al menos un caso negativo por control nuevo.
- No aparecen secretos en diff, logs ni mensajes de error.
