# 🎯 SlideDownloader
## 🚀 Características Principales

## 🚀 Demo en Vivo

## 🛠️ Tecnologías Utilizadas

## 📦 Instalación y Uso Local

## 📁 Estructura del Proyecto

## 🚀 Despliegue en GitHub Pages

### Opción A: GitHub Pages (Frontend Estático)

Perfecto para mostrar la interfaz web sin necesidad de backend:

1. **📂 Crear repositorio** en GitHub:
   - Nombre: `SlideDownloader`
   - Propietario: `ricker72`
   - Descripción: `Descargador de presentaciones de SlideShare`

2. **📤 Subir archivos**:
## 🌟 Características Adicionales

### 📱 Compatibilidad Móvil y Tablet

SlideDownloader está totalmente optimizado para dispositivos móviles y tablets:

| 📐 Característica | 📱 Soporte |
| :---: | :---: |
| **📄 Responsive Design** | Se adapta automáticamente a cualquier tamaño de pantalla |
| **🎯 Touch-Friendly** | Botones y controles optimizados para pantallas táctiles |
| **📐 Landscape/Portrait** | Funciona en ambas orientaciones |
| **⚡ Performance Móvil** | Cargas optimizadas y uso eficiente de recursos |
| **🖱️ Mouse & Touch** | Compatible con ambos tipos de entrada |

### 🌐 Sistema Multilenguaje (i18n)

SlideDownloader soporta múltiples idiomas para atender a usuarios globales:

| 🌍 Idioma | Código | Estado |
| :--- | :---: | :---: |
| **Español** | `es` | ✅ Completo |
| **English** | `en` | ✅ Completo |
| **Português** | `pt` | ✅ Completo |
| **Français** | `fr` | 🚧 En desarrollo |
| **Deutsch** | `de` | 🚧 En desarrollo |

#### Cómo funciona el sistema de idiomas:

1. **🔍 Detección automática**: El sitio detecta el idioma base del navegador/usuario
2. **🔄 Cambio manual**: Los usuarios pueden cambiar el idioma desde el menú
3. **💾 Persistencia**: El idioma seleccionado se guarda en `localStorage`
4. **🌐 Traducciones completas**: Interfaz, mensajes, errores y ayuda traducidos

#### Idiomas disponibles:

```javascript
// Ejemplo de configuración de idiomas
const i18n = {
  es: {  // Español
    title: 'SlideDownloader',
    url_placeholder: 'Pega el enlace de la presentación...',
    download_btn: 'Descargar',
    pptx: 'PowerPoint (PPTX)',
    pdf: 'PDF',
    docx: 'Word (DOCX)',
    // ... más traducciones
  },
  en: {  // English
    title: 'SlideDownloader',
    url_placeholder: 'Paste presentation link...',
    download_btn: 'Download',
    pptx: 'PowerPoint (PPTX)',
    pdf: 'PDF',
    docx: 'Word (DOCX)',
    // ... más traducciones
  },
  pt: {  // Português
    title: 'SlideDownloader',
    url_placeholder: 'Cole o link da apresentação...',
    download_btn: 'Baixar',
    pptx: 'PowerPoint (PPTX)',
    pdf: 'PDF',
    docx: 'Word (DOCX)',
    // ... más traducciones
  }
};
```
   - Mover/copiar la carpeta `slides_downloader/public/` al repositorio
   - O subir todos los archivos menos `node_modules/`

3. **⚙️ Configurar GitHub Pages**:
   - Ve a: `Configuración (Settings) → Páginas (Pages)`
   - **Rama**: `main` (default)
   - **Carpeta**: `/ (root)` 
   - Haz clic en **Guardar**

4. **🌐 URL del sitio**:
   - `https://ricker72.github.io/SlideDownloader/`
   - O con dominio personalizado si está configurado

### Opción B: Vercel (Recomendado - Full-Stack)

Para utilizar el backend Node.js completo con capacidades de descarga:

1. **🔗 Conectar repositorio** a Vercel
2. **🚀 Desplegar** con un clic
3. **📍 URL resultante**: `https://slide-downloader.vercel.app`

El archivo `vercel.json` ya está configurado para detectar automáticamente y desplegar tanto el frontend como el backend Node.js.
```text
/SlideDownloader/
├── 📄 package.json            # Dependencias y scripts de Node.js
├── 📄 vercel.json            # Configuración de despliegue Vercel
├── 📄 .gitignore             # Archivos excluidos del versionado
├── 📄 README.md              # Documentación del proyecto
│
├── 📁 slides_downloader/     # Directorio principal del proyecto
│   ├── 📁 public/            # Frontend estático (servido al usuario)
│   │   ├── 📄 index.html     # Página principal (6,903 bytes)
│   │   ├── 📄 style.css      # Estilos visuales (6,734 bytes)
│   │   └── 📄 app.js         # Lógica interactiva (6,671 bytes)
│   │
│   ├── 📁 server/            # Backend Node.js API
│   │   └── 📄 app.js         # Endpoints y lógica del servidor (8,813 bytes)
│   │
│   └── 📁 utils/             # Utilidades y helpers
│       └── 📄 downloader.js  # Funciones de procesamiento (7,218 bytes)
│
└── 📜 LICENSE                # Licencia MIT
```
### 🛠️ Requisitos Previos

```bash
# Node.js v18 o superior
# Git cuenta

# 1. Clonar el repositorio
git clone https://github.com/ricker72/SlideDownloader.git

# 2. Entrar al directorio del proyecto
cd SlideDownloader/slides_downloader

# 3. Instalar dependencias
npm install

# 4. Iniciar el servidor de desarrollo
node server/app.js
# Alternative (PowerShell):
pwsh -NoProfile -Command "cd 'C:\Users\samatha\OneDrive\Desktop\SlideDownloader\slides_downloader\server'; node app.js"
```

### 📱 Cómo Usar la Aplicación

Sigue estos sencillos pasos para descargar presentaciones:

1. **🌐 Accede** a la URL de tu despliegue
   - Local: `http://localhost:8080`
   - Vercel: `https://slide-downloader.vercel.app`
   - GitHub Pages: `https://ricker72.github.io/SlideDownloader/`

2. **🔗 Pega** el enlace de la presentación de SlideShare
   - Ejemplo: `https://www.slideshare.net/slideshow/gusano-barrenador-42662468/42662468`
   - O cualquier otro presentación de SlideShare

3. **🎯 Selecciona** el formato de descarga deseado:
   
   <div align="center">
   
   ```text
   ✅ PPTX - Presentación PowerPoint completamente editable
   ✅ PDF - Documento portátil de alta fidelidad visual
   ✅ DOCX - Documento de Word editable con formato
   ```
   
   </div>

4. **⬇️ Haz clic** en el botón **"Descargar"**

5. **📥 Recibe** el archivo en tu dispositivo:
   - **PPTX**: Abre en Microsoft PowerPoint, Google Slides, LibreOffice
   - **PDF**: Visualiza en cualquier visor de PDF, imprimir o compartir
   - **DOCX**: Edita en Microsoft Word, Google Docs, LibreOffice Writer
<div align="center">

| Tecnología | Categoría | Descripción |
| :--- | :--- | :--- |
| ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white) | Frontend | Estructura de la aplicación web |
| ![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3) | Frontend | Estilos visuales y animaciones |
| ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black) | Frontend | Lógica interactiva |
| ![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white) | Backend | Entorno de ejecución |
| ![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express) | Backend | Framework web API |

</div>
### Desplegado en Vercel:
<div align="center">
  <a href="https://slide-downloader.vercel.app">
    <img src="https://img.shields.io/badge/🌐_Ver_Demo-Vercel-black?style=for-the-badge&logo=vercel" alt="Ver Demo en Vercel">
  </a>
</div>

### URL del Sitio:
- **Frontend (GitHub Pages)**: `https://ricker72.github.io/SlideDownloader/`
- **Full-Stack (Vercel)**: `https://slide-downloader.vercel.app`
| 🎯 Característica | 📝 Descripción |
| :---: | :--- |
| **🔗 Soporte de URLs** | Pegar enlaces directos de SlideShare |
| **🎯 Formatos Múltiples** | Seleccionar PPTX, PDF u DOCX |
| 📱 **Diseño Responsivo** | Funciona en móviles, tablets y desktop |
| 📊 **Alta Calidad** | Descarga conservando calidad visual |
| 🛡️ **Interfaz Intuitiva** | Experiencia de usuario fluida |

### ✨ Capabilidades Destacadas

- **🚀 Descarga en un clic**: Pegar URL y seleccionar formato
- **🔄 Conversión de calidad**: Mantiene el formato y diseño original
- **🌐 Multi-plataforma**: Accede desde cualquier dispositivo
- **📥 Múltiples formatos**: PPTX, PDF, DOCX para diferentes necesidades

<div align="center">

[![GitHub Stars](https://img.shields.io/github/stars/ricker72/SlideDownloader?style=for-the-badge&color=yellow)](https://github.com/ricker72/SlideDownloader/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/ricker72/SlideDownloader?style=for-the-badge&color=orange)](https://github.com/ricker72/SlideDownloader/network/forks)
[![GitHub Watchers](https://img.shields.io/github/watchers/ricker72/SlideDownloader?style=for-the-badge&color=red)](https://github.com/ricker72/SlideDownloader/watchers)
[![GitHub Issues](https://img.shields.io/github/issues/ricker72/SlideDownloader?style=for-the-badge&color=orange)](https://github.com/ricker72/SlideDownloader/issues)
[![GitHub License](https://img.shields.io/github/license/ricker72/SlideDownloader?style=for-the-badge&color=blue)](https://github.com/ricker72/SlideDownloader/blob/main/LICENSE)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/ricker72/SlideDownloader?style=for-the-badge&color=green)](https://github.com/ricker72/SlideDownloader/commits/main)

</div>

## 📖 Descripción General

**SlideDownloader** es una **aplicación web profesional** diseñada para descargar presentaciones de **SlideShare** en formatos de alta calidad: **PPTX** (PowerPoint), **PDF** y **DOCX** (Word).

Con una interfaz intuitiva y responsiva, los usuarios pueden pegar cualquier enlace de SlideShare y elegir su formato de descarga preferido, obteniendo presentaciones conservando el formato original y calidad visual.

