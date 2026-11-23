# Conexión de servidores MCP en OpenCode V2

Fuente: <https://opencode.ai/docs/mcp-servers>. Verificar siempre allí antes de dar instrucciones de configuración.

## Forma general

En V2 los nombres van bajo `mcp.servers`, **no** directamente bajo `mcp`.

```jsonc title="opencode.jsonc"
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "mi-servidor": {
        "type": "local",
        "command": ["uv", "--directory", "/ruta/absoluta/mi-servidor", "run", "server.py"],
        "environment": {
          "API_KEY": "{env:MI_API_KEY}"
        }
      }
    }
  }
}
```

- `type`: `local` (stdio) o `remote` (Streamable HTTP).
- `command`: ejecutable y argumentos; usar ruta absoluta cuando el host lo requiera.
- `environment`: variables; secretos con `{env:NOMBRE}`, nunca literals.
- `disabled: true`: mantener configurado sin conectar.
- `cwd`: directorio de trabajo del proceso local.
- `codemode`: por defecto `true`, tools agrupadas en Code Mode; `false` las expone directamente.
- `protocol`: `legacy` (por defecto), `auto` o `2026-07-28`.
- `timeout`: `startup`, `catalog` y `execution` en milisegundos.

Servidor remoto con clave de API:

```jsonc
{
  "mcp": {
    "servers": {
      "docs": {
        "type": "remote",
        "url": "https://mcp.example.com/mcp",
        "oauth": false,
        "headers": { "X-API-Key": "{env:DOCS_API_KEY}" }
      }
    }
  }
}
```

## CLI

```sh
opencode mcp add mi-servidor -- uv --directory /ruta/absoluta/mi-servidor run server.py
opencode mcp add docs --url https://mcp.example.com/mcp
opencode mcp list
opencode mcp auth docs
opencode mcp logout docs
```

## Nombres y permisos

- Las tools se nombran `<servidor>_<tool>`; los caracteres no alfanuméricos se sustituyen por `_`.
- En Code Mode se accede como `tools.<servidor>.<tool>(...)`.
- Los prompts pasan a comandos `<servidor>:<prompt>`.
- Se pueden ocultar o denegar tools con actions de permisos, por ejemplo `mi-servidor_*`.

## Errores frecuentes

- Poner los servidores directamente bajo `mcp` (V1) en lugar de `mcp.servers` (V2).
- Escribir `$VAR` en JSON: no se expande. Usar `{env:VAR}`.
- Copiar secretos al archivo de configuración o al repositorio.
- Olvidar `oauth: false` en un servidor remoto que solo usa API key.
- Conectar un servidor que no pasó las pruebas aisladas.
