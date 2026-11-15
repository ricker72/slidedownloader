# 🖥️ SKILL: Analiza Compatibilidad

## Propósito
Garantizar que el código implementado funcione correctamente en Node.js, navegadores, Vercel/serverless y plataformas cliente (Android WebView, Windows, Linux). Se ejecuta en la **Fase 3** del Protocolo de Desarrollo Estricto.

---

## Ámbito del proyecto
- Runtime: Node.js >= 18 (`engines` en `package.json`)
- Backend: Express.js 5.x, CommonJS
- Frontend: HTML5, CSS3, JavaScript vanilla en `/public/`
- Despliegue: Vercel (serverless, `@vercel/node`)
- Renderizador externo: Playwright/Chromium (no disponible en serverless estándar)

---

## Checklist de compatibilidad

### 1. Node.js y versión
- [ ] ¿El código usa solo características de Node.js >= 18?
- [ ] ¿No se usan APIs experimentales o de versiones futuras sin verificación?
- [ ] ¿`package.json` tiene `"engines": { "node": ">=18" }`?

### 2. CommonJS vs ESM
- [ ] ¿Se usa `require`/`module.exports` (CommonJS) y no `import/export` (a menos que se agregue `"type": "module"`)?
- [ ] ¿`package.json` tiene `"type": "commonjs"` (ya está configurado así)?

### 3. Vercel / Serverless
- [ ] ¿El código funciona en entorno serverless de Vercel (`/api/index.js`)?
- [ ] ¿No se depende del sistema de archivos persistente excepto `/tmp` en Vercel?
- [ ] ¿Playwright/Chromium no se asume disponible en funciones serverless estándar?
- [ ] ¿`isVercel` se usa para diferenciar rutas de descargas (`/tmp` vs carpeta local)?

### 4. Navegadores y frontend
- [ ] ¿El frontend de `/public/` funciona en Chrome, Firefox, Safari y Edge?
- [ ] ¿El CSS es responsivo (móviles, tablets, escritorio)?
- [ ] ¿JavaScript vanilla no depende de frameworks modernos no incluidos en el proyecto?

### 5. Sistemas cliente (Android, Windows, Linux)
- [ ] ¿La aplicación web es accesible desde Android (WebView/Chrome), Windows y Linux?
- [ ] ¿Las rutas de archivos usan `path.join` y `path.resolve` (no separadores hardcodeados `\` o `/`)?
- [ ] ¿No hay dependencias específicas de un solo sistema operativo?

### 6. Dependencias
- [ ] ¿Las dependencias en `package.json` son compatibles con Node.js >= 18 y Vercel?
- [ ] ¿No se añaden dependencias pesadas que excedan el límite de tamaño de serverless?

---

## Salida esperada
Lista de problemas con formato:
```
ARCHIVO:LÍNEA - [COMPATIBILIDAD] Descripción del problema
```
Si no hay hallazgos, indicar: "Análisis de compatibilidad: sin problemas detectados."

---

## Ejemplo de activación
> "Ejecuta el skill analiza-compatibilidad sobre el código implementado en [archivo(s)] y reporta problemas de compatibilidad con ruta de archivo y línea."