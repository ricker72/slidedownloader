# ⚡ SKILL: Analiza Rendimiento

## Propósito
Detectar cuellos de botella, bloqueo del event loop y problemas de escalabilidad en el código implementado para SlideDownloader. Se ejecuta en la **Fase 3** del Protocolo de Desarrollo Estricto.

---

## Ámbito del proyecto
- Backend: `/server/app.js`, `/services/slideshareService.js`
- Frontend: `/public/*.js`, `/public/style.css`
- Tests: `/tests/*.test.js`
- Renderizador: Playwright/Chromium (opcional, no disponible en serverless estándar de Vercel)

---

## Checklist de rendimiento

### 1. Operaciones síncronas
- [ ] ¿No hay operaciones síncronas pesadas (`fs.readFileSync`, `fs.readdirSync`, `fs.statSync`) en rutas críticas de request/response?
- [ ] ¿Las operaciones de filesystem en `/server/app.js` y `/services/slideshareService.js` son asíncronas cuando sea posible?

### 2. Procesamiento de imágenes
- [ ] ¿Las imágenes grandes se procesan con `sharp` de forma asíncrona (`sharp(...).jpeg(...).toFile()` o similar)?
- [ ] ¿`applyImageQuality` y `selectSlideImages` no bloquean el hilo principal con URLs innecesarias?
- [ ] ¿Se descarta contenido no relacionado (miniaturas de presentaciones relacionadas) para reducir descargas?

### 3. Peticiones HTTP externas
- [ ] ¿Las peticiones a SlideShare usan timeouts adecuados (`DOWNLOAD_PROXY_TIMEOUT`)?
- [ ] ¿No se hacen peticiones secuenciales innecesarias que podrían paralelizarse?
- [ ] ¿El renderizador externo (Playwright) solo se usa cuando `RENDERER_URL` está configurado?

### 4. Limpieza de recursos
- [ ] ¿`cleanupOldJobs` elimina directorios de trabajos antiguos (>24h) para no llenar disco?
- [ ] ¿Los archivos temporales en `/tmp` (Vercel) o `/downloads` (local) se limpian tras fallos?
- [ ] ¿En `downloadPresentation`, el `cleanup()` se ejecuta en `catch` para no dejar carpetas vacías?

### 5. Frontend
- [ ] ¿El CSS y JS de `/public/` están minificados o al menos sin redundancias?
- [ ] ¿No hay bucle infinito o polling excesivo en el frontend?
- [ ] ¿Las imágenes de vista previa se cargan de forma eficiente (lazy loading si aplica)?

### 6. Base de datos / caché (si aplica)
- [ ] No aplica actualmente (proyecto sin base de datos). Si se añade, verificar consultas N+1 e índices.

---

## Salida esperada
Lista de oportunidades con formato:
```
ARCHIVO:LÍNEA - [RENDIMIENTO] Descripción del cuello de botella u oportunidad
```
Si no hay hallazgos, indicar: "Análisis de rendimiento: sin problemas detectados."

---

## Ejemplo de activación
> "Ejecuta el skill analiza-rendimiento sobre el código implementado en [archivo(s)] y reporta cuellos de botella con ruta de archivo y línea."