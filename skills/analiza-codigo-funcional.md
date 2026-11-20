# ⚙️ SKILL: Analiza Código Funcional

## Propósito
Verificar que la lógica de implementación cumpla exactamente con el requisito solicitado, sin efectos secundarios, sin código inventado y respetando las convenciones del proyecto SlideDownloader.

Se ejecuta en la **Fase 3** del Protocolo de Desarrollo Estricto, después de implementar el plan aprobado.

---

## Ámbito del proyecto
- Backend: `/server/app.js`, `/services/`, `/api/index.js` (Vercel)
- Frontend: `/public/*.html`, `/public/*.js`, `/public/style.css`
- Tests: `/tests/*.test.js` usando `node:test` + `node:assert/strict`
- Runtime: Node.js >= 18, CommonJS (`require`/`module.exports`)

---

## Checklist de auditoría funcional

### 1. Endpoints y rutas
- [ ] ¿El nuevo endpoint o ruta se registra correctamente en `/server/app.js`?
- [ ] ¿Los métodos HTTP (GET, POST, etc.) son los adecuados para la operación?
- [ ] ¿Las respuestas JSON siguen el formato `{ success: boolean, ... }` usado en el proyecto?
- [ ] ¿Los códigos de estado HTTP son correctos (200, 201, 400, 404, 503, 504)?

### 2. Servicios y lógica de negocio
- [ ] ¿Se reutilizan funciones existentes de `/services/slideshareService.js` cuando aplica (`normalizeSlideShareUrl`, `sanitizeFileName`, `selectSlideImages`, etc.)?
- [ ] ¿No se duplica lógica que ya existe en otro servicio?
- [ ] ¿Los nombres de funciones y variables siguen el estilo del proyecto (español cuando exista)?
- [ ] ¿Se manejan todos los casos de error con `createServiceError(mensaje, status)`?

### 3. Entradas y salidas
- [ ] ¿Se validan todas las entradas de `req.body`, `req.query`, `req.params` antes de usarlas?
- [ ] ¿Se valida que las URLs sean de SlideShare mediante `normalizeSlideShareUrl`?
- [ ] ¿Los nombres de archivo se sanitizan con `sanitizeFileName`?
- [ ] ¿Las respuestas incluyen los campos esperados (`title`, `format`, `quality`, `imageCount`, `fileName`) o envían el archivo con sus cabeceras `X-Download-*`?

### 4. Frontend
- [ ] ¿Los archivos de `/public/` mantienen la estructura de HTML/CSS/JS vanilla existente?
- [ ] ¿Las llamadas a la API usan `fetch` con manejo de errores (`try/catch`)?
- [ ] ¿La UI responde correctamente en móviles, tablets y escritorio?

### 5. Código prohibido (vibe coding)
- [ ] No hay `console.log` dejados en código de producción (salvo los existentes del proyecto).
- [ ] No hay variables sin usar.
- [ ] No hay comentarios tipo "TODO", "FIXME" sin contexto.
- [ ] No hay suposiciones sin verificar (ej: "asumo que la URL siempre funcionará").

---

## Salida esperada
Lista de hallazgos con formato:
```
ARCHIVO:LÍNEA - [FUNCIONAL] Descripción del hallazgo
```
Si no hay hallazgos, indicar: "Análisis funcional: sin hallazgos críticos."

---

## Ejemplo de activación
> "Ejecuta el skill analiza-codigo-funcional sobre el código implementado en [archivo(s)] y reporta hallazgos con ruta de archivo y línea."