# Relay de Scribd

Servidor pequeño que hace de puente entre la web desplegada en Vercel y Scribd.

Scribd entrega un «Client Challenge» a las IPs de centros de datos de Vercel
(también desde Edge Functions), por lo que `/api/scribd/inspect` y
`/api/scribd/download` fallan allí aunque funcionen en local. Este relay se
despliega en Railway (u otro host con IP no desafiada) y solo realiza el GET a
las vistas públicas de Scribd. La generación del PDF/PPTX/DOCX sigue ocurriendo
en Vercel.

No usa login, cookies ni credenciales de Scribd.

## Despliegue en Railway

1. Crear un servicio nuevo en Railway apuntando a este mismo repositorio.
2. En **Settings → Source**, configurar:
   - **Root Directory:** `scribd-relay`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. El archivo `railway.json` de esta carpeta ya define el start command, así que
   normalmente no hace falta escribirlo a mano.
4. Añadir la variable de entorno:

   ```text
   SCRIBD_RELAY_SECRET=una-cadena-larga-y-aleatoria
   ```

5. Opcional: `PORT` (Railway lo asigna automáticamente),
   `SCRIBD_RELAY_TIMEOUT_MS` (por defecto 20000).

6. Anotar la URL pública que dé Railway, por ejemplo
   `https://scribd-relay.railway.app`.

## Configuración en Vercel

En el proyecto de Vercel añadir exactamente las mismas dos variables:

```text
SCRIBD_RELAY_URL=https://scribd-relay.railway.app
SCRIBD_RELAY_SECRET=la-misma-cadena-larga-y-aleatoria
```

Con ambas variables presentes, el backend de Vercel deja de pedir Scribd
directamente y pasa a hacerlo a través del relay. Si faltan, se mantiene el
comportamiento anterior (petición directa).

## Endpoints

- `GET /api/health` — estado del servicio.
- `GET /fetch?url=<url codificada>` — pide una URL pública de
  `scribd.com` o `scribdassets.com`. Requiere
  `Authorization: Bearer <SCRIBD_RELAY_SECRET>`. Devuelve el cuerpo en binario
  y las cabeceras relevantes en `X-Upstream-Status` / `X-Upstream-Headers`.

## Comprobación

```bash
curl https://scribd-relay.railway.app/api/health
```

Después de configurar Vercel:

```bash
curl "https://slide-downloader.vercel.app/api/scribd/inspect?url=https%3A%2F%2Fes.scribd.com%2Fdocument%2F839333245%2FAnimales-Poligastricos"
```

Si Railway también recibe el reto de Scribd, la respuesta seguirá siendo el
`403` explicativo que ya muestra la aplicación.
