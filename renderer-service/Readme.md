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
- `CORS_ORIGIN`: https://tu-dominio.vercel.app (o *)

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
2. En el proyecto principal (`slides_downloader/`), crear un archivo `.env`:
   ```
   RENDERER_URL=https://slide-renderer.railway.app
   ```
3. El endpoint `/api/inspect` de SlideDownloader usará automáticamente el renderizador cuando el fetch directo falle.

## Endpoints

- `POST /render` — Recibe `{ url: "https://..." }` y devuelve título, descripción, imágenes y diapositivas.
- `GET /api/health` — Health check.

## Requisitos

- Node.js >= 18
- Puppeteer (incluye Chromium)
- ~150 MB de RAM mínimo
