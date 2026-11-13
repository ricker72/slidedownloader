const express = require('express');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const { chromium } = require('puppeteer');
const downloader = require('./utils/downloader');

const app = express();
const PORT = process.env.PORT || 8080;
const PORT = process.env.PORT || 8080;
const PORT = process.env.PORT || 3000;

// Middleware
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

// API: Establecer conexión con la página
app.post('/api/ping-slide', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL requerida' });
    }
    
    const browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    try {
      // Configurar User-Agent realista
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Navegar a la URL
      const response = await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      if (!response) {
        return res.json({ 
          success: false, 
          message: 'No se pudo conectar al servidor',
          statusCode: 0 
        });
      }
      
      const status = response.status();
      const finalUrl = page.url();
      
      // Detectar si hay desafío/cuenta de cookies
      const hasChallenge = await page.evaluate(() => {
        const title = document.title;
        return title.includes('challenge') || title.includes('Challenge');
      });
      
      // Obtener cookies
      const cookies = await page.cookies();
      const cookieNames = cookies.map(c => c.name);
      
      // Obtener contenido de la página
      const content = await page.content();
      
      // Escalar el viewport a 1920x1080
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Esperar carga completa
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      
      // Cargar completamente
      await page.waitForTimeout(3000);
      
      // Verificar si el desafío aún está presente
      const challengeDetected = await page.evaluate(() => {
        const title = document.title;

// API: Descargar archivo por URL directa
app.post('/api/direct-download', async (req, res) => {
  try {
    const { url, format } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL requerida' });
    }
    
    // Validar URL
    const slideUrl = downloader.validateUrl(url);
    if (!slideUrl) {
      return res.status(400).json({ error: 'URL no válida' });
    }
    
    // Validar formato
    const supportedFormats = ['pptx', 'pdf', 'docx'];
    if (!supportedFormats.includes(format)) {
      return res.status(400).json({ 
        error: `Formato no soportado: ${format}. Formatos disponibles: pptx, pdf, docx` 
      });
    }
    
    // Obtener el nombre del archivo
    const filename = downloader.getFileName(slideUrl, format);
    
    // Crear respuesta de descarga
    res.json({
      success: true,
      message: 'Iniciando descarga...',
      filename: filename,
      format: format,
      url: slideUrl,
      downloadType: format
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al preparar descarga', details: error.message });
  }
});
        const bodyContent = document.body.innerText;
        const hasChallenge = title.includes('challenge') || 
                            title.includes('Challenge') ||

// API: Subir archivo para descarga
app.post('/api/upload', async (req, res) => {
  try {
    const { file, url, format } = req.body;
    
    if (file) {
      // Descargar archivo recibido
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
  }
});
                            title.includes('osano') ||
                            bodyContent.includes('desafío');
        return hasChallenge;
      });
      
      // Obtener enlaces de recursos
      const links = await page.evaluate(() => {
        const elements = document.querySelectorAll('a');
        return Array.from(elements)
          .map(a => a.href)
          .filter(h => h && h.startsWith('http'));
      });
      
      res.json({
        success: true,
        status: status,
        finalUrl: finalUrl,
        challengeDetected: challengeDetected || hasChallenge,
        hasChallenge: challengeDetected,
        cookies: cookieNames,
        contentLength: content.length,
        viewport: { width: 1920, height: 1080 },
        linksCount: links.length,
        resourceLinks: links.slice(0, 50)
      });
      
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al establecer conexión', details: error.message });
  }
});
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
});