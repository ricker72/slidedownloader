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
