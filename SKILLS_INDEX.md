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
