# 🔒 SKILL: Auditoría de Seguridad

## Propósito
Detectar vulnerabilidades de seguridad antes de que lleguen a producción en el proyecto SlideDownloader. Se ejecuta en la **Fase 3** del Protocolo de Desarrollo Estricto.

---

## Ámbito del proyecto
- Backend: `/server/app.js`, `/services/slideshareService.js`, `/services/promptService.js`, `/services/presentationSearch.js`
- Frontend: `/public/*.html`, `/public/*.js`
- Despliegue: Vercel (serverless, sistema de archivos de solo lectura excepto `/tmp`)

---

## Checklist de seguridad obligatorio

### 1. Validación de entradas
- [ ] ¿Toda entrada de usuario (`req.body`, `req.query`, `req.params`) se valida antes de usarla?
- [ ] ¿Las URLs de SlideShare se validan con `normalizeSlideShareUrl` (solo `slideshare.net` o subdominios)?
- [ ] ¿Se rechazan dominios no permitidos para prevenir SSRF?

### 2. Path traversal (atravesamiento de rutas)
- [ ] ¿Antes de leer/escribir archivos, se usa `path.resolve` + `path.join` y se verifica que el resultado esté dentro del directorio permitido?
- [ ] Ejemplo de patrón seguro ya usado en `/server/app.js` línea ~574: `filePath.startsWith(root + path.sep)`
- [ ] ¿Los nombres de archivo se sanitizan con `sanitizeFileName`?

### 3. SSRF (Server-Side Request Forgery)
- [ ] ¿Las peticiones HTTP externas solo van a dominios de confianza (slideshare.net, CDN de SlideShare)?
- [ ] ¿No se permiten IPs privadas, localhost o rangos reservados en peticiones salientes?
- [ ] `isPrivateHostname` en `/server/app.js` debe respetarse para proxys de descarga.

### 4. XSS (Cross-Site Scripting)
- [ ] ¿Los datos de usuario mostrados en el frontend se escapan correctamente?
- [ ] ¿No se usa `innerHTML` con contenido no sanitario en `/public/*.js`?
- [ ] ¿Los títulos de presentaciones se escapan antes de insertar en el DOM?

### 5. Secrets y credenciales
- [ ] ¿No hay claves API, tokens o contraseñas hardcodeadas en ningún archivo?
- [ ] ¿Las variables de entorno (`GOOGLE_CSE_ID`, `RENDERER_URL`) se leen con `process.env` y no se exponen innecesariamente?
- [ ] ¿El `.gitignore` excluye archivos sensibles?

### 6. Headers de seguridad
- [ ] ¿Helmet está activo y configurado en `/server/app.js`?
- [ ] ¿Se establecen headers como `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`?

### 7. Límites y timeouts
- [ ] ¿Hay límite de tamaño en descargas/proxys (`DOWNLOAD_PROXY_MAX_BYTES = 40 MB`)?
- [ ] ¿Hay timeouts en peticiones HTTP externas (`DOWNLOAD_PROXY_TIMEOUT = 25 s`)?
- [ ] ¿Se limpian trabajos antiguos (`cleanupOldJobs`) para evitar llenar el disco?

---

## Salida esperada
Lista de riesgos con formato:
```
ARCHIVO:LÍNEA - [SEGURIDAD - NIVEL] Descripción del riesgo
```
Niveles: CRÍTICO, ALTO, MEDIO, BAJO.

Si no hay hallazgos, indicar: "Auditoría de seguridad: sin vulnerabilidades detectadas."

---

## Ejemplo de activación
> "Ejecuta el skill auditoria-seguridad sobre el código implementado en [archivo(s)] y reporta riesgos con nivel y ruta de archivo."