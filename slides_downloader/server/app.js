const express = require('express');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const downloader = require('./utils/downloader');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// API: Verificar estado del servicio
app.post('/api/ping', async (req, res) => {
  try {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Descargar presentación
app.post('/api/download', async (req, res) => {
  try {
    const { url, format } = req.body;
    
    if (!url || !format) {
      return res.status(400).json({ 
        error: 'Faltan parámetros. Se requiere URL y formato de descarga.' 
      });
    }
    
    // Validar URL
    const slideUrl = downloader.validateUrl(url);
    if (!slideUrl) {
      return res.status(400).json({ 
        error: 'URL no válida. Ingrese una URL de SlideShare válida.' 
      });
    }
    
    // Validar formato
    const supportedFormats = ['pptx', 'pdf', 'docx'];
    if (!supportedFormats.includes(format)) {
      return res.status(400).json({ 
        error: 'Formato no soportado. Formatos disponibles: pptx, pdf, docx' 
      });
    }
    
    res.json({ 
      message: 'Iniciando descarga, por favor espere...',
      slideUrl: slideUrl,
      format: format
    });
    
    // Procesar descarga
    const result = await downloader.download(slideUrl, format);
    
    res.json({
      success: true,
      message: 'Descarga completada exitosamente',
      data: result,
      downloadUrl: `/download/${result.filename}`
    });
    
  } catch (error) {
    console.error('Error en descarga:', error);
    res.status(500).json({ 
      error: 'Error interno al procesar la descarga',
      details: error.message 
    });
  }
});

// API: Verificar URL de SlideShare (versión simplificada sin Puppeteer)
app.post('/api/ping-slide', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL requerida' });
    }
    
    // Validar URL usando la utilidad existente (sin Puppeteer)
    const slideUrl = downloader.validateUrl(url);
    if (!slideUrl) {
      return res.status(400).json({ error: 'URL no válida. Ingrese una URL de SlideShare válida.' });
    }
    
    // Retornar información básica de la URL
    const urlObj = new URL(slideUrl);
    return res.json({
      success: true,
      message: 'URL válida detectada',
      slideUrl: slideUrl,
      domain: urlObj.hostname
    });
  } catch (error) {
    console.error('Error en ping-slide:', error);
    res.status(500).json({ error: 'Error al procesar la URL' });
  }
});

// API: Subir archivo
app.post('/api/upload', async (req, res) => {
  try {
    const { file, url, format } = req.body;
    
    if (file) {
      const base64Data = file.replace(/^data:[^;]+;base64,/, '');
      const filePath = path.join(__dirname, '..', 'downloads', 'uploaded_file');
      await promisify(fs.writeFile)(filePath, Buffer.from(base64Data, 'base64'));
      
      return res.json({
        success: true,
        message: 'Archivo recibido',
        filename: 'uploaded_file',
        type: file.type
      });
    }
    
    if (!url) {
      return res.status(400).json({ error: 'URL requerida' });
    }
    
    const slideUrl = downloader.validateUrl(url);
    if (!slideUrl) {
      return res.status(400).json({ error: 'URL no válida' });
    }
    
    res.json({
      success: true,
      message: 'URL recibida, iniciando descarga...',
      filename: downloader.getFileName(slideUrl, format || 'pptx'),
      url: slideUrl,
      downloadType: format || 'pptx'
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al procesar archivo', details: error.message });
  }
});

// Servir archivos descargados
app.get('/download/:filename', (req, res) => {
  const { filename } = req.params;
  const downloadDir = path.join(__dirname, '..', 'downloads');
  
  const filePath = path.join(downloadDir, filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }
  
  res.download(filePath, filename);
});

// Ruta 404 para rutas no encontradas
app.use((req, res) => {
  res.status(404).send('<h1>404 - Página no encontrada</h1>');
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📦 Panel de control: http://localhost:${PORT}`);
});

module.exports = app;