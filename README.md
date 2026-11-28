# 🎯 SlideDownloader

> **Descargador profesional de presentaciones de SlideShare** con soporte para múltiples formatos, vista previa de diapositivas, calidad HD y asistente de IA para recrear presentaciones con identidad visual propia.

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-5.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/es/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)](https://developer.mozilla.org/es/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/es/docs/Web/JavaScript)
[![Vercel](https://img.shields.io/badge/Vercel-Deploy-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)

</div>

<div align="center">

[![GitHub Stars](https://img.shields.io/github/stars/ricker72/SlideDownloader?style=social&label=Stars)](https://github.com/ricker72/SlideDownloader/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/ricker72/SlideDownloader?style=social&label=Forks)](https://github.com/ricker72/SlideDownloader/network/forks)
[![GitHub Watchers](https://img.shields.io/github/watchers/ricker72/SlideDownloader?style=social&label=Watchers)](https://github.com/ricker72/SlideDownloader/watchers)
[![GitHub Issues](https://img.shields.io/github/issues/ricker72/SlideDownloader?style=flat-square)](https://github.com/ricker72/SlideDownloader/issues)
[![GitHub License](https://img.shields.io/github/license/ricker72/SlideDownloader?style=flat-square)](https://github.com/ricker72/SlideDownloader/blob/main/LICENSE)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/ricker72/SlideDownloader?style=flat-square)](https://github.com/ricker72/SlideDownloader/commits/main)

</div>

---

## 📖 Sobre el Proyecto

**SlideDownloader** es una aplicación web profesional diseñada para descargar presentaciones de **SlideShare** en múltiples formatos de salida: **PPTX**, **PPSX**, **POTX** (PowerPoint), **PDF**, **DOCX** (Word) y **TXT/MD** (solo texto).

### 🎯 Enfoque del Proyecto

El proyecto está enfocado en brindar a usuarios, estudiantes, docentes y profesionales una herramienta rápida, gratuita y sin registro para:

- 📥 **Descargar** presentaciones públicas de SlideShare en el formato que necesiten
- 👁️ **Vista previa** de las diapositivas antes de descargar
- 🔄 **Seleccionar calidad** de imagen (SD estándar / HD alta resolución)
- 🤖 **Asistente de IA**: generar un prompt profesional listo para copiar y pegar en cualquier IA (ChatGPT, Claude, Gemini, etc.) y recrear la presentación con una identidad visual nueva, imágenes propias, temas claros y buena tipografía, además de un **resumen estructurado con el tema principal**
- 📝 **Exportación de texto**: descargar solo el contenido en TXT o Markdown para estudiar o alimentar otras IAs, con OCR opcional
- 📱 **Interfaz responsiva** que funciona en móviles, tablets y escritorio

---

## 🚀 Características Principales

| Característica | Descripción | Estado |
|:---|:---|:---:|
| 📥 **Múltiples formatos** | PPTX, PPSX, POTX, PDF, DOCX, TXT y MD | ✅ Disponible |
| 👁️ **Vista previa** | Grid de miniaturas antes de descargar | ✅ Disponible |
| 🔄 **Calidad HD/SD** | Selector de resolución de imagen | ✅ Disponible |
| 🤖 **Asistente IA** | Genera prompts profesionales y un resumen estructurado con el tema principal | ✅ Disponible |
| 📝 **Solo texto** | Exporta TXT/Markdown con OCR opcional para estudiar o alimentar IAs | ✅ Disponible (OCR opt-in) |
| 📄 **Documentos de Scribd** | Descarga documentos públicos en PDF, PPTX, PPSX, POTX y DOCX | ✅ Disponible |
| 🌐 **Detección automática** | Analiza la URL al pegarla en el input | ✅ Disponible |
| 📱 **Responsive** | Adaptado a móvil, tablet y desktop | ✅ Disponible |
| 🌍 **Multilenguaje** | Español, Inglés y Portugués | ✅ Disponible |
| 🔒 **Seguridad** | Validación de URL y protección contra path traversal | ✅ Disponible |

El **PPTX** generado se puede abrir directamente en **Google Slides** y en **Keynote**: es el mismo archivo, sin conversión intermedia. No se genera un `.key` nativo ni se sube el archivo a Google Drive.

---

## 🤖 Skills para agentes de IA

El repo incluye skills en formato OpenCode (`.opencode/skills/<id>/SKILL.md`). Se descubren automáticamente al abrir el proyecto y cualquier modelo puede cargarlos con `skill(id)` antes de ejecutar una acción:

- `development-protocol`: 4 fases obligatorias (análisis → plan aprobado → ejecución auditada → build/test).
- `secure-coding`: seguridad desde la escritura del código.
- `code-review` + `code-review-security`, `-performance`, `-architecture`, `-testing`: revisión priorizada por perspectivas.
- `code-improvement-refactor`, `skill-creator`, `mcp-server-builder`: mejora segura, creación de Skills y servidores MCP.

Índice completo y comandos de estado: [`SKILLS_INDEX.md`](SKILLS_INDEX.md). Validación: `node .opencode/skills/skill-creator/scripts/validate-skills.mjs .opencode/skills`.

Los skills de `skills/` y `.cursor/rules/` siguen disponibles para Cursor; los de `.opencode/skills/` son la versión canónica para OpenCode.

---

## 🛠️ Tecnologías Utilizadas

<div align="center">

| Tecnología | Categoría | Versión | Propósito |
|:---|:---|:---:|:---|
| ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white) | Frontend | 5 | Estructura de la interfaz |
| ![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white) | Frontend | 3 | Estilos y animaciones |
| ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black) | Frontend | ES6+ | Lógica interactiva |
| ![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=nodedotjs&logoColor=white) | Backend | >=18 | Entorno de ejecución |
| ![Express.js](https://img.shields.io/badge/Express.js-5.x-000000?style=flat-square&logo=express&logoColor=white) | Backend | 5.x | Framework web y API |
| ![Puppeteer](https://img.shields.io/badge/Puppeteer-22.x-4080F0?style=flat-square&logo=puppeteer&logoColor=white) | Renderizador | 22.x | Extracción de slides (servidor externo) |
| ![PptxGenJS](https://img.shields.io/badge/PptxGenJS-3.x-0066CC?style=flat-square) | Generación | 3.x | Creación de archivos PPTX |
| ![PDFKit](https://img.shields.io/badge/PDFKit-0.15.x-22615D?style=flat-square) | Generación | 0.15.x | Creación de archivos PDF |
| ![Docx](https://img.shields.io/badge/Docx-9.x-2B579A?style=flat-square) | Generación | 9.x | Creación de archivos DOCX |
| ![jszip](https://img.shields.io/badge/JSZip-3.x-0066CC?style=flat-square) | Utilidad | 3.x | Manipulación de archivos ZIP/OOXML |

</div>

## 📄 Descargas de Scribd

La página `/scribd` permite descargar documentos **públicos** de Scribd en PDF, PPTX, PPSX, POTX y DOCX. Pega el enlace del documento, pulsa **Analizar** para ver sus metadatos y una vista previa de las primeras páginas, elige la calidad y el formato. Se admiten enlaces `/document/{id}`, `/doc/{id}` y `/presentation/{id}` de cualquier subdominio de Scribd.

**Calidad de imagen**

- **HD (por defecto)**: cada página se guarda al doble de su resolución original con remuestreo Lanczos y se codifica en JPEG de alta calidad, de modo que el texto y las imágenes no se ven borrosos al ampliar el archivo.
- **SD**: conserva la resolución original (más ligero y rápido).
- En Vercel, si el archivo HD superara el límite de respuesta de la función, se recomprime de forma automática solo lo necesario para que la descarga se complete sin fallar.

**Cómo funciona**

1. Se lee el visor embebido público (`/embeds/{id}/content`), la misma vista que Scribd entrega a cualquier visitante.
2. Se obtiene el manifiesto de páginas de `/document_downloads/{id}` y se elige el que contiene más páginas.
3. Cada página se materializa como imagen: el PNG del CDN es un atlas con la diapositiva y fragmentos, así que se recorta según las reglas `clip:rect` del visor para obtener una página limpia del tamaño declarado; si no hay imagen, la página se reconstruye desde su capa de texto con `sharp`.
4. El archivo final se genera con el mismo pipeline que SlideShare (PDFKit, PptxGenJS y docx).

**Límites y avisos**

- Solo documentos públicos. No se usa login, cookies ni credenciales, y no se resuelve ningún mecanismo de autenticación.
- Máximo **60 páginas** por descarga.
- Si el autor no permite la descarga, la API responde `403`.
- Los documentos cuyo texto está protegido por sustitución de caracteres se rechazan con `422`: reconstruirlos produciría texto ilegible.
- Los documentos retirados o inexistentes responden `404`.
- Descarga únicamente material sobre el que tengas derechos. Respeta los términos de Scribd y los derechos de autor.
- En Vercel el sistema de archivos solo permite `/tmp` y las funciones tienen un límite de ejecución de 60 s; los archivos grandes pueden requerir ejecutar el proyecto en un servidor propio.
- Scribd sirve una página «Client Challenge» a varias IPs de centros de datos (incluida Vercel). Cuando ocurre, la API responde `403` con un mensaje específico; el descargador funciona al ejecutarlo en local o en un servidor con una IP no desafiada por Scribd.
- Para usar la web desplegada en Vercel, despliega `scribd-relay/` en Railway y configura `SCRIBD_RELAY_URL` y `SCRIBD_RELAY_SECRET` en Vercel con los mismos valores. Las instrucciones están en [`scribd-relay/Readme.md`](scribd-relay/Readme.md). Sin esas variables el backend pide Scribd directamente.

**API**

| Método | Ruta | Descripción |
|:---|:---|:---|
| `GET` | `/api/scribd/inspect?url=` | Metadatos del documento: título, páginas, formatos y permiso de descarga |
| `GET` | `/api/scribd/preview?url=&pages=` | Miniaturas JPEG de las primeras páginas (máximo 6) para mostrar la vista previa |
| `POST` | `/api/scribd/download` | Genera el archivo y lo devuelve en la misma respuesta (descarga directa). Cuerpo: `{ "url": "...", "format": "pdf", "quality": "hd" }` (calidad `hd` o `sd`; `hd` por defecto) |

## 🔎 Configuración del filtro de Google

El Filtro de Presentaciones usa el **Programmable Search Element** oficial de Google para buscar y mostrar hasta 10 archivos directos `.ppt`, `.pptx` o `.pdf` en las tarjetas de la aplicación. No requiere una clave de API JSON; solo necesita el ID público de un motor de búsqueda:

- `GOOGLE_CSE_ID`: ID público de un Programmable Search Engine. Los resultados se limitan a los sitios y dominios configurados en ese motor.

En PowerShell, antes de iniciar el servidor local:

```powershell
$env:GOOGLE_CSE_ID = "tu-id-del-buscador"
npm start
```

En Vercel, configura `GOOGLE_CSE_ID` en **Project Settings → Environment Variables**. El ID se expone al navegador para cargar el componente oficial de Google; no es una clave secreta. En [Programmable Search Engine](https://programmablesearchengine.google.com/controlpanel/all), agrega los dominios que quieres incluir en **Sites to search**. La aplicación no puede mostrar resultados de sitios que el motor no tenga habilitados; el enlace «Abrir búsqueda en Google» permite continuar la consulta en Google Search.

La aplicación personaliza sus resultados mediante el callback oficial de resultados de Google y conserva las tarjetas con vista previa y descarga. No automatiza ni raspa la página de resultados de Google. Si un tema no devuelve archivos, comprueba los dominios configurados en el motor y que esos sitios incluyan archivos compatibles.

## 🖥️ Renderizador externo (opcional)

Para las presentaciones que SlideShare bloquea al hacer `fetch` directo, se puede desplegar la carpeta `renderer-service/` (Puppeteer) en Railway, Render o fly.io. En el proyecto principal configura:

- `RENDERER_URL`: URL del servicio desplegado.
- `RENDERER_SECRET`: secreto compartido. El renderizador exige `Authorization: Bearer <secreto>` en cada petición; sin él responde `503` y con uno distinto `401`.

El renderizador solo acepta URLs públicas de `slideshare.net`, limita los renders concurrentes y bloquea peticiones del navegador hacia IPs privadas o locales. Si no se configura, la aplicación sigue funcionando con el método `lite` (fetch directo).

## 📦 Límites de conversión

Para no agotar la memoria ni el tiempo de ejecución (especialmente en Vercel), la conversión aplica estos topes:

- **Diapositivas**: 200 en local y **80 en serverless**. Se ajusta con `MAX_SLIDES`.
- **Tamaño por imagen**: 15 MB (`MAX_IMAGE_BYTES`). Si una variante HD supera el tope, se prueba la siguiente calidad.
- **Tamaño total de imágenes**: 160 MB en local y **80 MB en serverless** (`MAX_TOTAL_IMAGE_BYTES`). Si se supera, la API responde `413`.
- **Tiempo de descarga de imágenes**: 5 minutos en local y **35 s en serverless** (`MAX_DOWNLOAD_MS`). Si se agota, responde `504`.
- **Concurrencia de descarga**: 10 en local y 8 en serverless (`IMAGE_CONCURRENCY`).

### Límites visibles en la interfaz

La página principal muestra los límites vigentes **antes** de pulsar «Descargar presentación»: máximo de diapositivas, diapositivas detectadas, tamaño estimado, tope por imagen, tope total y tiempo máximo. Si la presentación supera un tope, se muestra un aviso.

- `GET /api/limits` devuelve esos valores (y los de conversión WebP) desde la configuración real del servidor.
- `POST /api/inspect` también los incluye en `limits`, junto con `detectedSlideCount` (diapositivas antes del recorte) y `slideCount` (las que se descargarán).
- `ESTIMATED_BYTES_PER_SLIDE_SD` (120 KB) y `ESTIMATED_BYTES_PER_SLIDE_HD` (450 KB) configuran la estimación. Es orientativa: se muestra con `~` y no es una medida del archivo final.

### Conversión de WebP

SlideShare publica la variante HD como WebP, que PDF, PowerPoint y Word no admiten de forma fiable. Se convierte así:

- `WEBP_CONVERSION=auto` (por defecto): las diapositivas con aspecto de texto o diagrama pasan a **PNG sin pérdida** (mejor nitidez); el resto, a JPEG.
- `WEBP_CONVERSION=jpeg`: fuerza JPEG para todas, como antes.
- `WEBP_CONVERSION=png`: fuerza PNG para todas.
- `JPEG_QUALITY`: calidad del JPEG resultante, de **1 a 100** (por defecto, **92**).
- `WEBP_PNG_MAX_BYTES`: tope del PNG generado (8 MB por defecto). Si se excede, se usa JPEG para no agotar el presupuesto de la función.

Las imágenes se insertan en PPTX y DOCX conservando su proporción real (con bandas blancas si hace falta), sin estirarlas.

## 📝 Exportación de texto y resumen del asistente

Los formatos `txt` y `md` se añaden a `/api/download` sin cambiar su contrato: el archivo se envía en la misma respuesta con las cabeceras `X-Download-*` habituales (incluida `X-Download-Warnings` cuando hay avisos).

- **Sin OCR (por defecto)**: el archivo contiene título, autor, fuente, número de diapositivas y una sección de limitaciones que deja claro que **no es una transcripción**. Es útil como ficha de estudio y para alimentar IAs con metadatos fiables.
- **Con OCR**: `OCR_ENABLED=true` activa `tesseract.js` sobre las imágenes de las diapositivas. La primera ejecución descarga el modelo de idioma y lo guarda en caché. Controles:
  - `OCR_LANG`: código de Tesseract (por defecto `eng`; usa `spa` para español).
  - `OCR_MAX_SLIDES`: máximo de diapositivas procesadas (por defecto 10, tope 50).
  - `OCR_TIMEOUT_MS`: timeout por diapositiva (por defecto 20 000 ms).
  - `OCR_CACHE_DIR`: directorio de caché del modelo (por defecto `downloads/.ocr-cache`).
- El OCR es secuencial y costoso en CPU. En Vercel conviene dejarlo desactivado y, si se necesita, encolar la descarga con el modo asíncrono descrito abajo. Los fallos parciales se anotan en el archivo y en `X-Download-Warnings`; el texto reconocido se trata siempre como dato, nunca como instrucciones.
- `GET /api/limits` informa de forma aditiva `textFormats: ['txt','md']` y `ocrEnabled`.

El asistente (`/ai`) añade un panel de **resumen estructurado** junto al prompt: tema principal con nivel de confianza, vista general, puntos clave, estructura sugerida y limitaciones. `POST /api/prompt` devuelve el campo aditivo `summary` y acepta opcionalmente `analysis.slideTexts` (máximo 30 fragmentos de 4000 caracteres) para enriquecer el resumen. El resumen se calcula con heurísticas locales: no llama a servicios externos ni modifica el prompt existente.

## ⏳ Trabajos en segundo plano (experimental)

`POST /api/download` sigue generando y enviando el archivo **en la misma petición**. Ese es el comportamiento por defecto y no cambia. Opcionalmente se puede habilitar un modo asíncrono:

- `JOBS_ENABLED=true` activa `POST /api/jobs`, `GET /api/jobs/:id` y la ruta del artefacto. Sin esta variable (o sin worker en el proceso), responden `404`.
- `POST /api/jobs` acepta el mismo cuerpo que `/api/download` y responde `202` con `jobId` y `pollUrl`. La URL de sondeo incluye un **token de posesión**: guárdala, no es suficiente con el UUID. La cola acepta hasta 50 trabajos pendientes (`MAX_JOB_QUEUE`); al llenarse responde `503`.
- `GET /api/jobs/:id?token=...` devuelve `status` (`queued`, `running`, `done`, `failed`), `progress` y, cuando termina, `result.downloadUrl`. Incluye `pollAfterMs` (2 s): la UI lo respeta en lugar de sondear cada segundo.
- `GET /api/jobs/:id/artifact/:filename?token=...` sirve el archivo generado con `Cache-Control: no-store`. El token puede ir en la query (compatibilidad) o, preferiblemente, en `Authorization: Bearer <token>` / `X-Job-Token` para que no quede en logs ni en el historial. Los logs redactan `token=` de la URL.
- Son dos capabilities distintas: el token de sondeo **no** sirve para descargar el artefacto, que usa el suyo propio. Una URL caducada responde `410`.

El worker reutiliza la misma lógica de descarga, sube el resultado al almacén de artefactos y limpia el directorio temporal mediante E/S asíncrona. Procesa **un trabajo a la vez** para no solapar generaciones. Reintenta fallos transitorios con backoff (`MAX_JOB_ATTEMPTS`, por defecto 2); los errores de validación (4xx) fallan de inmediato. Los trabajos abandonados se recuperan sin consumir un intento. Cada minuto se barren los caducados: trabajos a las 24 h (`JOB_TTL_MS`), artefactos a la 1 h y enlaces de descarga a los 15 min.

**Estado de la implementación:** los stores son en memoria. El worker solo se crea dentro de `node server/app.js` (`require.main === module`), por lo que el modo asíncrono funciona **solo en local/instancia única**. En Vercel, `api/index.js` importa la app sin worker y las invocaciones no comparten memoria: aunque se configure `JOBS_ENABLED`, los endpoints siguen desactivados y `/api/limits` informa `jobsEnabled: false`. Para habilitarlo allí hacen falta tres cosas: adaptadores compartidos (Redis para trabajos, Blob/S3 para artefactos) que implementen los contratos de `services/jobStore.js` y `services/artifactStore.js`, un proceso worker independiente, y una cola durable. La URL de descarga siempre será una ruta de esta API, así que los adaptadores solo gestionan bytes (`put`/`get`/`getContentType`/`delete`/`deleteExpired`). Por todo eso la variable está desactivada por defecto.

El handler de Vercel usa `maxDuration: 300` (Fluid Compute, plan Hobby) en lugar de los 60 s anteriores. Esto amplía el presupuesto de la descarga sincrónica; no sustituye a una cola durable.

## 💻 Lenguaje de Programación

El proyecto está escrito principalmente en **JavaScript (ES6+)** para tanto el frontend como el backend, ejecutado sobre **Node.js**.

- **Frontend:** HTML5, CSS3, JavaScript vanilla
- **Backend:** Node.js + Express.js
- **Renderizador externo:** Node.js + Puppeteer (Chromium)

---

## 👨‍💻 Autor y Repositorio

<div align="center">

**Creado por:** [ricker72](https://github.com/ricker72)

**Repositorio:** [https://github.com/ricker72/SlideDownloader](https://github.com/ricker72/SlideDownloader)

</div>

---

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Para contribuir:

1. Haz un **fork** del repositorio
2. Crea una rama: `git checkout -b feature/nueva-funcionalidad`
3. Haz tus cambios y confirma: `git commit -m 'feat: agregar nueva funcionalidad'`
4. Sube la rama: `git push origin feature/nueva-funcionalidad`
5. Abre un **Pull Request**

---

## 📄 Licencia

Este proyecto está bajo la **Licencia MIT**. Consulta el archivo [LICENSE](https://github.com/ricker72/SlideDownloader/blob/main/LICENSE) para más información.

```
MIT License

Copyright (c) 2026 ricker72

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

## ⭐ Soporte

Si este proyecto te fue útil, considera darle una ⭐ en GitHub para apoyar el desarrollo continuo.

<div align="center">

**[⬆ Volver al inicio](#-slidedownloader)**

</div>

---

<div align="center">

**Hecho con ❤️ por [ricker72](https://github.com/ricker72)**

</div>
