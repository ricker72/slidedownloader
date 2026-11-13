// Elementos del DOM
const urlInput = document.getElementById('url-input');
const pasteBtn = document.getElementById('paste-btn');
const detectBtn = document.getElementById('detect-btn');
const downloadBtn = document.getElementById('download-btn');
const statusIndicator = document.getElementById('status-indicator');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const statusDetail = document.getElementById('status-detail');

// Estado actual
let currentFormat = 'pptx';
let isProcessing = false;

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
  // Configurar escuchadores de eventos
  pasteBtn.addEventListener('click', handlePaste);
  detectBtn.addEventListener('click', handleDetect);
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleDownload();
    }
  });
  downloadBtn.addEventListener('click', handleDownload);


/**
 * Manejar botón detectar
 */
async function handleDetect() {
  const url = urlInput.value.trim();
  if (!url) {
    showStatus('error', 'Ingresa una URL primero');
    return;
  }

  if (isProcessing) return;

  showStatus('idle', 'Verificando URL...');
  setLoading(true);

  try {
    const response = await fetch('/api/ping-slide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await response.json();

    if (data.success) {
      if (data.challengeDetected) {
        showStatus('warning', 'Página bajo protección de acceso. La descarga podría requerir autenticación.');
      } else {
        showStatus('success', 'Página accesible');
/**
 * Mostrar estado en la interfaz
 */
function showStatus(type, message) {
  const statusMap = {
    'success': { className: 'success', color: 'var(--success)' },
    'error': { className: 'error', color: 'var(--danger)' },
    'warning': { className: 'warning', color: 'var(--warning)' },
    'info': { className: 'info', color: 'var(--primary)' },
    'idle': { className: 'idle', color: 'var(--secondary)' }
  };

  const config = statusMap[type] || statusMap.idle;
  statusDot.className = config.className;
  statusDot.style.background = config.color;
  statusText.textContent = message;
}

/**
 * Mostrar detalles del estado
 */
function showDetail(data, url, format) {
  let html = '';
  
  if (data.success) {
    html += `<p><strong>URL:</strong> ${url}</p>`;
    html += `<p><strong>Formato:</strong> ${getFormatName(format)}</p>`;
    html += `<button onclick="window.location.href='${data.downloadUrl}'" class="btn btn-primary">
      <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
        <path fill-rule="evenodd" d="M3 17a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm1.5-4.5c-.828 0-1.5.672-1.5 1.5S6.172 10 7 10s1.5-.672 1.5-1.5S7.828 5.5 7 5.5zm0 10c-.828 0-1.5.672-1.5 1.5s.672 1.5 1.5 1.5 1.5-.672 1.5-1.5-.672-1.5-1.5-1.5zM7 6a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1z" clip-rule="evenodd"/>
      </svg>
      Descargar Archivo
    </button>`;
  } else {
    html += `<p style="color: var(--danger)">${data.error || data.message || 'Error desconocido'}</p>`;
  }
  
  statusDetail.innerHTML = html;
}

/**
 * Obtener nombre del formato
 */
function getFormatName(format) {
  const formats = {
    'pptx': 'PowerPoint',
    'pdf': 'PDF',
    'docx': 'Word'
  };
  return formats[format] || format;
}

/**
 * Configurar estado de carga
 */
function setLoading(loading) {
  isProcessing = loading;
  document.querySelectorAll('.btn').forEach(btn => {
    btn.disabled = loading;
  });
}
      }

      showDetail(data, data.finalUrl, data.linksCount);
    } else {
      showStatus('error', 'No se pudo acceder a la URL');
      showDetail({}, data.message || 'Error desconocido');
    }
  } catch (error) {
    showStatus('error', 'Error de conexión');
    console.error('Error:', error);
  } finally {
    setLoading(false);
  }
}

/**
 * Manejar descarga
 */
async function handleDownload() {
  const url = urlInput.value.trim();
  if (!url) {
    showStatus('error', 'Ingresa una URL primero');
    return;
  }

  if (isProcessing) return;

  // Obtener formato seleccionado
  const selectedFormat = document.querySelector('input[name="format"]:checked');
  if (!selectedFormat) {
    showStatus('error', 'Selecciona un formato de descarga');
    return;
  }
  currentFormat = selectedFormat.value;

  showStatus('idle', 'Preparando descarga...');
  setLoading(true);
  downloadBtn.disabled = true;

  try {
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format: currentFormat })
    });

    const data = await response.json();

    if (data.success) {
      showStatus('success', 'Descarga iniciada');
      showDetail(data, data.url, data.format);
      
      // Opción: redirigir al archivo descargado
      setTimeout(() => {
        window.location.href = data.downloadUrl;
      }, 2000);
    } else {
      showStatus('error', data.error || 'Error al procesar');
    }
  } catch (error) {
    showStatus('error', 'Error de conexión');
    console.error('Error:', error);
  } finally {
    setLoading(false);
    downloadBtn.disabled = false;
  }
}
  // Verificar estado del servidor
  checkServerStatus();
});

/**
 * Verificar estado del servidor
 */
async function checkServerStatus() {
  try {
    const response = await fetch('/api/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    if (response.ok) {
      showStatus('success', 'Servidor conectado');
    } else {
      showStatus('error', 'Servidor no responde');
    }
  } catch (error) {
    showStatus('error', 'Servidor no disponible');
  }
}

/**
 * Manejar botón pegar
 */
function handlePaste() {
  // Pegar del portapapeles
  navigator.clipboard.readText().then(text => {
    if (text && urlInput.value !== text) {
      urlInput.value = text;
      showStatus('success', 'URL detectada en el portapapeles');
      setTimeout(() => {
        showStatus('idle', 'Listo para descargar');
      }, 2000);
    } else {
      showStatus('info', 'No se pudo acceder al portapapeles');
    }
  }).catch(err => {
    showStatus('error', 'No se pudo acceder al portapapeles');
    console.error('Error:', err);
  });
}