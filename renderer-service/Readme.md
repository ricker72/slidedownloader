# Renderizador de SlideShare (Puppeteer)

Servidor externo que usa Chromium real para extraer slides de SlideShare.
**No desplegar en Vercel serverless** (Chromium no funciona allí).

## Despliegue rápido

### Railway
```bash
# Conectar este repositorio o subir la carpeta renderer-service/
railway init
railway up
```

Variables de entorno en Railway:
- `PORT`: 3001
- `RENDERER_SECRET`: obligatorio. Cadena larga y aleatoria; debe coincidir con la del proyecto principal.
- `CORS_ORIGIN`: opcional. Origen del frontend si se llama directo desde el navegador; por defecto no se habilita CORS (el servidor principal llama de servidor a servidor).
- `MAX_CONCURRENT_RENDERS`: opcional, por defecto 2.
- `MAX_QUEUED_RENDERS`: opcional, por defecto 10.
- `RENDER_TIMEOUT_MS`: opcional, por defecto 120000.

### Render
```bash
# Crear Web Service desde la carpeta renderer-service/
# Build command: npm install
# Start command: npm start
```

### fly.io
```bash
fly launch --dockerfile-ignored  # o crear fly.toml manual
fly deploy
```

## Cómo se usa con SlideDownloader

1. Desplegar este servicio y anotar su URL (ej: `https://slide-renderer.railway.app`).
2. En el proyecto principal, definir las mismas variables:
   ```
   RENDERER_URL=https://slide-renderer.railway.app
   RENDERER_SECRET=la-misma-cadena-larga
   ```
3. El endpoint `/api/inspect` de SlideDownloader usará el renderizador para extraer todas las diapositivas; si no está disponible, cae al método `lite` (fetch directo).

Sin `RENDERER_SECRET` el servicio responde `503` en `/render`; con un secreto distinto responde `401`.

## Endpoints

- `POST /render` — Requiere `Authorization: Bearer <RENDERER_SECRET>`. Recibe `{ url: "https://www.slideshare.net/..." }` y devuelve título, descripción, imágenes y diapositivas. Solo acepta URLs de `slideshare.net`.
- `GET /api/health` — Health check (incluye renders activos y en cola).

## Requisitos

- Node.js >= 18
- Puppeteer (incluye Chromium)
- ~150 MB de RAM mínimo
