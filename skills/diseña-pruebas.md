# 🧪 SKILL: Diseña Pruebas

## Propósito
Definir y revisar pruebas unitarias e de integración para el código implementado en SlideDownloader, asegurando cobertura y detección de regresiones. Se ejecuta en la **Fase 3** del Protocolo de Desarrollo Estricto.

---

## Ámbito del proyecto
- Framework de pruebas: `node:test` + `node:assert/strict` (ya configurado en `package.json`: `"test": "node --test tests/**/*.test.js"`)
- Directorio de pruebas: `/tests/`
- Convención de nombres: `*.test.js`

---

## Checklist de pruebas

### 1. Cobertura de funciones nuevas
- [ ] ¿Cada función nueva o modificada en `/services/` tiene al menos una prueba unitaria en `/tests/`?
- [ ] ¿Los nombres de archivo de prueba siguen la convención (ej: `slideshare-service.test.js` para `slideshareService.js`)?

### 2. Casos edge (bordes)
- [ ] ¿Se prueban entradas inválidas (URL inválida, dominio no permitido, `null`, `undefined`)?
- [ ] ¿Se prueban nombres de archivo con caracteres especiales (`sanitizeFileName`)?
- [ ] ¿Se prueban URLs de SlideShare con y sin protocolo (`normalizeSlideShareUrl`)?

### 3. Endpoints de API (integración)
- [ ] ¿Los endpoints críticos (`/api/inspect`, `/api/download`, `/api/prompt`) tienen pruebas de integración?
- [ ] ¿Se verifican códigos de estado HTTP (200, 400, 404, 503)?
- [ ] ¿Se verifican cuerpos de respuesta JSON con formato esperado?

### 4. Manejo de errores
- [ ] ¿Se prueban que `createServiceError` lanza errores con el código de estado correcto?
- [ ] ¿Se prueban fallos de red, renderizador no disponible y respuestas vacías?

### 5. Frontend (si aplica)
- [ ] ¿Las funciones de JavaScript de `/public/` tienen pruebas cuando sea posible?
- [ ] ¿Se prueban funciones de utilidad como `buildSearchQuery`, `normalizeTopic`, `cleanFileTitle`?

### 6. Ejecución de pruebas
- [ ] ¿`npm test` pasa al 100% (41 pruebas actualmente, más las nuevas)?
- [ ] ¿No hay pruebas ignoradas (`test.skip`) ni pendientes (`test.todo`) sin justificación?

---

## Salida esperada
Lista de pruebas sugeridas con formato:
```
ARCHIVO_PRUEBA.js - [PRUEBA] Nombre de la prueba: descripción del caso
```
Ejemplo:
```
tests/nueva-funcionalidad.test.js - [PRUEBA] normaliza URLs de SlideShare con subdominio
```

Si el código ya está cubierto, indicar: "Diseño de pruebas: cobertura suficiente."

---

## Ejemplo de activación
> "Ejecuta el skill diseña-pruebas para el código implementado en [archivo(s)] y sugiere pruebas con nombre de archivo y caso de prueba."