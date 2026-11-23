# 📚 Índice de Skills - SlideDownloader

Este documento registra todos los skills disponibles para el asistente de IA en este repositorio. Todos los skills operan bajo el **Protocolo de Desarrollo Estricto** (`.cursor/rules/protocolo-desarrollo-estricto.mdc`) y se activan **automáticamente** en cada tarea de implementación.

---

## 🧑‍💻 Skill Principal

| Archivo | Nombre | Propósito | Fase del protocolo |
|---------|--------|-----------|-------------------|
| `SKILL_SENIOR_DEVELOPER.md` | Senior Developer Experto | Actúa como desarrollador senior full-stack + ciberseguridad + sistemas (Android, Windows, Linux) | Todas (1-4) |

---

## ⚙️ Sub-skills de Auditoría (Fase 3)

| Archivo | Nombre | Propósito | Fase del protocolo |
|---------|--------|-----------|-------------------|
| `skills/analiza-codigo-funcional.md` | Analiza Código Funcional | Verifica lógica correcta, casos de uso, flujos de datos y convenciones del proyecto | Fase 3 |
| `skills/auditoria-seguridad.md` | Auditoría de Seguridad | Detecta XSS, path traversal, SSRF, validación de entradas, headers, secrets expuestos | Fase 3 |
| `skills/analiza-rendimiento.md` | Analiza Rendimiento | Detecta cuellos de botella, bloqueo del event loop, procesamiento de imágenes, limpieza de recursos | Fase 3 |
| `skills/analiza-compatibilidad.md` | Analiza Compatibilidad | Verifica Node.js >= 18, CommonJS, Vercel/serverless, navegadores, Android/WebView, Windows/Linux | Fase 3 |
| `skills/disenã-pruebas.md` | Diseña Pruebas | Define pruebas unitarias e integración con `node:test`, casos edge y cobertura | Fase 3 |

---

## 🤖 Skills de OpenCode incluidos en el repo

Estos skills usan el formato oficial de OpenCode: `.opencode/skills/<id>/SKILL.md`. OpenCode los descubre automáticamente al abrir este repositorio y cualquier modelo puede cargarlos con la herramienta `skill(id)` **antes de ejecutar cualquier acción**.

| ID | Propósito |
|----|-----------|
| `development-protocol` | Protocolo obligatorio de 4 fases: análisis, plan aprobado, ejecución auditada y build/test. |
| `secure-coding` | Escritura segura desde el inicio en web, backend, videojuegos y Android/Windows/Linux. |
| `code-review` | Orquestador que unifica y prioriza los hallazgos de las revisiones. |
| `code-review-security` | Inyección, IDOR, SSRF, XSS, CSRF, secretos, crypto y dependencias. |
| `code-review-performance` | Complejidad, N+1, memoria, concurrencia, E/S y render. |
| `code-review-architecture` | Acoplamiento, SOLID, contratos públicos y deuda técnica. |
| `code-review-testing` | Aserciones, casos borde, rutas negativas y determinismo. |
| `code-improvement-refactor` | Refactorización segura con tests de caracterización y rollback. |
| `skill-creator` | Diseño y validación de Skills con descripción-enrutador. |
| `mcp-server-builder` | Diseño, implementación y prueba aislada de servidores MCP. |

**Uso:** cargar, por ejemplo, `skill("development-protocol")` al iniciar cualquier tarea; `code-review` delega en los sub-skills atómicos según el cambio.

**Validación:** `node .opencode/skills/skill-creator/scripts/validate-skills.mjs .opencode/skills`

> Los skills anteriores de `/skills` y `.cursor/rules` siguen vigentes para Cursor. Los de `.opencode/skills` son la versión canónica para OpenCode y cualquier agente que soporte este formato; conviven sin sobrescribirse.

---

## 🗂️ Archivos de Reglas del Sistema (Siempre activos)

| Archivo | Nombre | Propósito |
|---------|--------|-----------|
| `.cursor/rules/protocolo-desarrollo-estricto.mdc` | Protocolo de Desarrollo Estricto | 4 fases obligatorias antes de escribir código de producción (`alwaysApply: true`) |
| `.cursor/rules/activacion-automatica-skills.mdc` | Activación Automática de Skills | Fuerza la activación de skills sin que el usuario los solicite explícitamente (`alwaysApply: true`) |

---

## 📋 Comandos de estado obligatorios (envía automáticamente)

Al iniciar una tarea:
> "Actúa bajo el Protocolo de Desarrollo. Inicia la Fase 1 para [descripción]. No escribas código todavía."

Al revisar el análisis:
> "El análisis es correcto. Pasa a la Fase 2 y dame el plan de implementación."

Al aprobar el plan:
> "Plan aprobado. Ejecuta la Fase 3 (usa el linter para verificar errores) y termina con el build de la Fase 4."

---

## ➕ Cómo agregar un nuevo skill

1. Crea el archivo `.md` en la carpeta `/skills`.
2. Regístralo en este índice (`SKILLS_INDEX.md`) en la tabla correspondiente.
3. Referéncialo desde `SKILL_SENIOR_DEVELOPER.md` en la tabla de habilidades conectadas.
4. Asegúrate de que respete las 4 fases del protocolo y nunca escriba código antes de la aprobación de la Fase 2.

---

## ✅ Flujo completo automático

```
Usuario pide implementar algo
    ↓
Skill Senior Developer se activa automáticamente
    ↓
Fase 1: Diagnóstico → Pregunta si el entendimiento es correcto
    ↓
Fase 2: Plan → Espera "Aprobado"
    ↓
Fase 3: Implementación + 5 sub-skills de auditoría
    ↓
Fase 4: Build y pruebas (npm test al 100%)
    ↓
Entrega completada
```
