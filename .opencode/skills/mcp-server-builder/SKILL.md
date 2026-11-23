---
name: mcp-server-builder
description: Diseña, implementa y valida servidores MCP (Model Context Protocol) con tools, resources y prompts seguros y precisos: decide el alcance, elige el SDK, define esquemas de entrada, escribe errores auto-corregibles y prueba el servidor aislado antes de conectarlo a OpenCode. Úsalo cuando el usuario pida crear, revisar o conectar un MCP, exponer funciones como herramientas de agente o configurar `mcp.servers`. No modifica código de producción sin aprobación.
---

# Constructor de servidores MCP

Entregable: un servidor MCP **probado de forma aislada** y listo para conectarse, con un conjunto pequeño de herramientas bien descritas y un plan de validación ejecutable. Trabaja siempre bajo `development-protocol`.

## Cuándo usarlo

- El usuario pide "crea un MCP", "expón esta API como herramientas", "conecta este servidor".
- Hay que revisar un servidor MCP existente o sus herramientas.
- Hay que configurar un servidor local o remoto en OpenCode.

Fuente de verdad: documentación oficial de MCP (`https://modelcontextprotocol.io/llms.txt`) y, para OpenCode, `https://opencode.ai/docs/mcp-servers`. **No inventes APIs ni sintaxis**: abre la página correspondiente a la versión del SDK que se vaya a instalar antes de escribir código.

## Principios de diseño

1. **Pocas herramientas, muy precisas.** No conviertas cada endpoint en una tool. Agrupa operaciones que el agente necesita realmente.
2. **Nombres que explican el resultado.** `get_document`, `search_issues`, `create_ticket`. Evita `do_thing`, `api_call`, `run`.
3. **La descripción es documentación para un compañero nuevo.** Incluye qué hace, cuándo usarla, qué devuelve y qué errores puede dar. El modelo solo ve esa descripción para decidir.
4. **Esquemas de entrada estrictos.** Tipos concretos, `enum` cerrados, rangos y longitudes. Rechaza entradas inválidas con un mensaje que diga qué se esperaba y cómo corregirlo.
5. **Salidas compactas y predecibles.** Devuelve texto/markdown o JSON estable; evita volcar respuestas gigantes y limita paginación.
6. **Errores accionables.** "No encontré el id `X`; usa `search_issues` para listar ids válidos" mejor que "Error 500".
7. **Efectos secundarios explícitos.** Separa herramientas de lectura de herramientas que escriben; nombra las mutaciones con verbos claros.

## Alcance antes de codificar

Define y haz aprobar (Fase 2 del protocolo):

- Herramientas: nombre, descripción, esquema de entrada, salida y errores.
- Resources: datos de solo lectura que el agente debe poder consultar.
- Prompts: plantillas reutilizables.
- Transporte: `stdio` para servidores locales; Streamable HTTP para remotos.
- Límites: red, sistema de archivos, comandos, credenciales y scopes.

## Elegir stack

- **Python**: SDK oficial `mcp` (2.0.0+), Python 3.10+. La guía actual usa `MCPServer` de `mcp.server`; verifica la API real de la versión instalada antes de usar `FastMCP` u otras aliases. Instalar con `uv add "mcp[cli]"`.
- **TypeScript**: SDK oficial `@modelcontextprotocol/server` con `serveStdio`; Node 20+. Verificar la versión publicada: las guías antiguas usaban `@modelcontextprotocol/sdk` y `StdioServerTransport`.
- Otros SDKs oficiales: C#, Go, Rust, Ruby (Tier 1); Java, Swift, PHP, Kotlin (según doc). No elijas un SDK no oficial sin justificación y revisión de seguridad.

Lee `references/opencode-config.md` antes de conectar el servidor a OpenCode.

## Reglas de implementación

- En `stdio`, **nunca escribas en stdout**: corrompe JSON-RPC. Usa `logging` (stderr) en Python o `console.error` en TypeScript.
- Valida y normaliza toda entrada en el límite de la tool; confía dentro.
- Usa timeouts y límites de tamaño en toda E/S. Ninguna tool debe poder bloquear indefinidamente.
- Si la tool acepta URLs, aplica lista blanca de hosts y bloquea rangos privados, loopback (salvo desarrollo explícito) y `169.254.0.0/16`. No sigas redirecciones sin revalidar.
- Si accede a archivos, restringe rutas a un directorio permitido, normaliza y verifica que la ruta resuelta siga dentro (`path traversal`, `zip slip`).
- Nunca pongas secretos en código ni en la configuración: usa variables de entorno (`{env:NAME}` en OpenCode).
- Nunca confíes en un handle/ID como prueba de identidad: vincularlo al usuario autenticado.
- Registra errores sin exponer tokens, stacks ni datos sensibles al modelo.
- Versiona el servidor (`name`, `version`) y documenta cambios incompatibles.

## Prueba aislada obligatoria

Antes de conectar al agente:

1. Arranca el servidor solo (sin OpenCode) y verifica que no hay errores de arranque ni ruido en stdout.
2. Lista tools/resources/prompts y comprueba nombres, descripciones y esquemas.
3. Llama a cada tool con: entrada válida, entrada inválida y caso borde. Verifica el error y que sugiera corrección.
4. Ejecuta el Inspector oficial de MCP (`npx @modelcontextprotocol/inspector`) o el cliente del SDK; comprueba ambos eras de protocolo si el cliente lo exige.
5. Verifica timeouts, rutas fuera del límite y URLs no permitidas.
6. Ejecuta linter, tipos/tests del proyecto y deja constancia del resultado.

Solo después de pasar estas pruebas se conecta al agente (Fase 4).

## Criterios de éxito

- El alcance de tools/resources/prompts está aprobado por escrito.
- Las descripciones permiten al modelo elegir la tool correcta sin leer código.
- Entradas inválidas producen errores auto-corregibles, no excepciones opacas.
- Ninguna tool puede salir de su límite de red, archivos o privilegios.
- El servidor arranca, lista capacidades y pasa las pruebas aisladas antes de conectarse.
- La configuración de OpenCode usa `mcp.servers` y secretos por entorno.
