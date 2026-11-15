const express = require('express');
const router = express.Router();
const scribdService = require('../services/scribdService');

// Ruta para procesar un enlace de Scribd (similar a docdownloader.com)
router.post('/process', async (req, res) => {
  try {
    const { url } = req.body || {};
    
    if (!url) {
      return res.json({ error: 'URL de Scribd requerida' });
    }

    // Procesar el enlace de Scribd
    const result = await scribdService.processScribdDownload(url);
    
    res.json({
      success: result.success,
      document: result.document
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta para buscar documentos en Scribd
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    
    if (!query) {
      return res.json({ error: 'Término de búsqueda requerido' });
    }

    const result = await scribdService.searchDocuments(query);
    
    res.json({
      success: result.success,
      query: result.query,
      totalResults: result.totalResults,
      documents: result.documents
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta para verificar estado de un documento de Scribd
router.get('/status', async (req, res) => {
  try {
    const { url } = req.query || {};
    
    if (!url) {
      return res.json({ error: 'URL de documento requerida' });
    }

    const result = await scribdService.getDocumentStatus(url);
    
    res.json({
      success: result.success,
      info: result.info
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta para verificar acceso público a un documento
router.get('/check', async (req, res) => {
  try {
    const url = req.query.url || '';
    if (!url) {
      return res.json({ error: 'URL de documento requerida' });
    }

    scribdService.checkPublicDocument(url, (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(result);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;