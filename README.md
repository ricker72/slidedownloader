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

**SlideDownloader** es una aplicación web profesional diseñada para descargar presentaciones de **SlideShare** en múltiples formatos de salida: **PPTX**, **PPSX**, **POTX** (PowerPoint), **PDF** y **DOCX** (Word).

### 🎯 Enfoque del Proyecto

El proyecto está enfocado en brindar a usuarios, estudiantes, docentes y profesionales una herramienta rápida, gratuita y sin registro para:

- 📥 **Descargar** presentaciones públicas de SlideShare en el formato que necesiten
- 👁️ **Vista previa** de las diapositivas antes de descargar
- 🔄 **Seleccionar calidad** de imagen (SD estándar / HD alta resolución)
- 🤖 **Asistente de IA**: generar un prompt profesional listo para copiar y pegar en cualquier IA (ChatGPT, Claude, Gemini, etc.) y recrear la presentación con una identidad visual nueva, imágenes propias, temas claros y buena tipografía
- 📱 **Interfaz responsiva** que funciona en móviles, tablets y escritorio

---

## 🚀 Características Principales

| Característica | Descripción | Estado |
|:---|:---|:---:|
| 📥 **Múltiples formatos** | PPTX, PPSX, POTX, PDF y DOCX | ✅ Disponible |
| 👁️ **Vista previa** | Grid de miniaturas antes de descargar | ✅ Disponible |
| 🔄 **Calidad HD/SD** | Selector de resolución de imagen | ✅ Disponible |
| 🤖 **Asistente IA** | Genera prompts profesionales para recrear presentaciones | ✅ Disponible |
| 🌐 **Detección automática** | Analiza la URL al pegarla en el input | ✅ Disponible |
| 📱 **Responsive** | Adaptado a móvil, tablet y desktop | ✅ Disponible |
| 🌍 **Multilenguaje** | Español, Inglés y Portugués | ✅ Disponible |
| 🔒 **Seguridad** | Validación de URL y protección contra path traversal | ✅ Disponible |

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

---

## 📁 Estructura del Proyecto

```
SlideDownloader/
├── 📄 .env.example              # Variables de entorno de ejemplo
├── 📄 .gitignore                # Archivos excluidos del versionado
├── 📄 LICENSE                   # Licencia MIT
├── 📄 package.json              # Dependencias y scripts de Node.js
├── 📄 package-lock.json         # Bloqueo de versiones de dependencias
├── 📄 README.md                 # Documentación del proyecto
├── 📄 vercel.json               # Configuración de despliegue en Vercel
│
├── 📁 api/
│   └── 📄 index.js              # Wrapper serverless para Vercel (@vercel/node)
│
├── 📁 renderer-service/         # Servidor externo de renderizado (Puppeteer)
│   ├── 📄 package.json
│   ├── 📄 server.js             # Servidor Express + Puppeteer
│   └── 📄 Readme.md             # Documentación del renderizador
│
└── 📁 slides_downloader/        # Código fuente principal
    ├── 📁 public/               # Frontend estático
    │   ├── 📄 index.html        # Página principal
    │   ├── 📄 ai.html           # Asistente de Presentaciones IA
    │   ├── 📄 app.js            # Lógica interactiva (descargar)
    │   ├── 📄 ai.js             # Lógica interactiva (asistente IA)
    │   └── 📄 style.css         # Estilos visuales modernos
    │
    ├── 📁 server/
    │   └── 📄 app.js            # Backend Express (API y endpoints)
    │
    ├── 📁 services/
    │   ├── 📄 slideshareService.js   # Lógica de extracción y exportación
    │   └── 📄 promptService.js       # Generador de prompts para IA
    │
    ├── 📁 utils/
    │   └── 📄 downloader.js     # Utilidades de descarga de archivos
    │
    └── 📁 downloads/            # Archivos generados (ignorado en git)
```

---

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

## 📦 Instalación y Uso Local

### Requisitos Previos

| Requisito | Versión Mínima |
|:---|:---:|
| Node.js | 18+ |
| npm | Incluido con Node.js |
| Git | Cualquier versión reciente |

### Pasos para Instalar

```bash
# 1. Clonar el repositorio
git clone https://github.com/ricker72/SlideDownloader.git

# 2. Entrar al directorio del proyecto
cd SlideDownloader

# 3. Instalar dependencias
npm install

# 4. Iniciar el servidor de desarrollo
npm start

# 5. Abrir en el navegador
# http://localhost:8080
```

---

## 🎯 Cómo Usar la Aplicación

### Descargar Presentaciones

1. **🌐 Accede** a la aplicación (local: `http://localhost:8080` o en Vercel)
2. **🔗 Pega** el enlace de la presentación de SlideShare
   - Ejemplo: `https://www.slideshare.net/slideshow/gusano-barrenador-42662468/42662468`
3. **👁️ Revisa** la vista previa automática de las diapositivas
4. **🎯 Selecciona** el formato de descarga deseado:
   - ✅ **PPTX** - Presentación PowerPoint editable
   - ✅ **PPSX** - Presentación a pantalla completa
   - ✅ **POTX** - Plantilla de PowerPoint reutilizable
   - ✅ **PDF** - Documento portátil de alta fidelidad
   - ✅ **DOCX** - Documento de Word editable
   - ⛔ **PPT / DOC** - Formatos binarios antiguos (requieren conversión externa)
5. **🔄 Elige calidad:** SD (estándar) o HD (alta resolución)
6. **⬇️ Haz clic** en "Descargar presentación"

### Asistente de Presentaciones IA (`/ai`)

1. **🌐 Accede** a `http://localhost:8080/ai`
2. **🔗 Pega** el enlace de SlideShare o ingresa los datos manualmente
3. **⚙️ Configura** el objetivo, tono, estilo visual, paleta y número de diapositivas
4. **🪄 Genera** el prompt profesional
5. **📋 Copia** el prompt y pégalo en tu IA preferida (ChatGPT, Claude, Gemini, etc.)

---

## ☁️ Despliegue en Vercel (Recomendado)

SlideDownloader está configurado para desplegarse fácilmente en [Vercel](https://vercel.com).

### Despliegue Rápido

1. Sube este proyecto a un repositorio de GitHub
2. Ve a [Vercel](https://vercel.com) → **Add New Project** → Importa el repositorio
3. Vercel detectará `vercel.json` automáticamente
4. Haz clic en **Deploy**

### Variables de Entorno en Vercel

Configura las siguientes variables en el panel de control de Vercel:

| Variable | Valor Ejemplo | Descripción |
|:---|:---|:---|
| `RENDERER_URL` | `https://tu-renderizador.railway.app` | URL del servidor de renderizado externo (opcional pero recomendado) |
| `NODE_ENV` | `production` | Entorno de producción (ya configurado en vercel.json) |

---

## 🖥️ Servidor de Renderizado Externo (Recomendado)

SlideShare bloquea peticiones HTTP directas con un "Client Challenge" (anti-scraping). Para obtener las **imágenes reales** de las presentaciones y poder incrustarlas en PPTX/PDF/DOCX, necesitas un servidor con Chromium real.

### ¿Qué es `renderer-service/`?

Servidor Node.js + Puppeteer que abre la presentación de SlideShare en un navegador real y extrae título, descripción, autor y URLs de las imágenes de cada diapositiva.

### Despliegue del Renderizador

```bash
# 1. Entrar a la carpeta del renderizador
cd renderer-service

# 2. Instalar dependencias
npm install

# 3. Iniciar el servidor
npm start
```

Despliega en [Railway](https://railway.app), [Render](https://render.com), [fly.io](https://fly.io) o cualquier VPS con Node.js.

### Conectar con SlideDownloader

En el proyecto principal, crea un archivo `.env` (basado en `.env.example`):

```env
RENDERER_URL=https://tu-renderizador.railway.app
```

El endpoint `/api/inspect` intentará automáticamente:
1. **Fetch directo** (rápido, sin servidor extra)
2. **Renderizador externo** (Puppeteer, si `RENDERER_URL` está configurado)
3. **Entrada manual** (el usuario completa los datos en la UI)

---

## ⚠️ Limitaciones en Serverless (Vercel)

| Característica | Estado en Vercel | Nota |
|:---|:---:|:---|
| Descarga de formatos (PDF, PPTX, PPSX, POTX, DOCX) | ✅ Funciona | Generado en memoria y devuelto en la respuesta |
| `/api/inspect` (análisis de presentación) | ⚠️ Parcial | SlideShare puede bloquear peticiones directas. Usa `RENDERER_URL` |
| Vista previa de diapositivas | ⚠️ Parcial | Depende de `/api/inspect` |
| `/download/:jobId/:filename` | ⚠️ Parcial | Sistema de archivos efímero. Usa Vercel Blob, S3 o similar |
| Playwright / Chromium | ❌ No compatible | Se eliminó de `/api/inspect`. Usa `renderer-service/` por separado |

---

## 🗺️ Hoja de Ruta (Roadmap)

- [x] ✅ Descarga en PPTX, PPSX, POTX, PDF y DOCX
- [x] ✅ Vista previa de diapositivas con calidad SD/HD
- [x] ✅ Asistente de IA para generación de prompts
- [x] ✅ Despliegue en Vercel
- [ ] ⏳ Soporte para PPT y DOC mediante conversión externa
- [ ] ⏳ Autenticación de usuario y historial de descargas
- [ ] ⏳ API pública para integraciones de terceros
- [ ] ⏳ Modo oscuro / claro (tema toggle)

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
