---
name: code-improvement-refactor
description: Propuestas de refactorización segura que preservan la API pública y el comportamiento observable: tests de caracterización, pasos incrementales, patrón strangler, extracción de funciones y módulos, eliminación de duplicación y plan de rollback. Úsalo cuando el usuario pida mejorar, limpiar o simplificar código sin cambiar lo que hace, o como perspectiva de la Fase 3 del protocolo de desarrollo. Entrega un plan por pasos; no aplica cambios sin aprobación.
---

# Mejora y refactorización segura

Perspectiva atómica de mejora. Reporta al skill `code-review` cuando éste esté activo. **No ejecuta refactors por su cuenta**: produce un plan verificable.

## Objetivo

Mejorar la estructura del código manteniendo **exactamente** el comportamiento observable y los contratos públicos. Un refactor sin tests de caracterización no es un refactor, es un cambio de comportamiento esperando a ocurrir.

## Cuándo activarse

- El usuario pide "limpiar", "simplificar", "mejorar" o "refactorizar".
- Hay duplicación, funciones largas o nombres confusos.
- Un cambio de arquitectura o librería debe hacerse sin romper consumidores.
- Hay deuda técnica que hay que pagar por pasos.

## Reglas de oro

1. **Primero caracteriza, luego cambia.** Añade tests que congelen el comportamiento actual antes de tocar nada.
2. **Un paso, una verificación.** Cada paso debe ser ejecutable, testeable y reversible por separado.
3. **API pública intacta.** Firma, nombres exportados, formatos de retorno y errores no cambian salvo aprobación explícita.
4. **Sin "limpieza" invisible.** No mezcles refactor con corrección de bugs o cambios de formato masivos en el mismo paso.
5. **Rollback explícito.** Cada paso indica cómo volver atrás (revert del commit o feature flag).

## Método

### 1. Línea base

- Ejecuta linter, análisis estático y suite completa. Guarda el resultado.
- Identifica el contrato público: exports, endpoints, tipos, eventos, esquemas.
- Lista el comportamiento observable que debe permanecer igual.

### 2. Caracterización

- Añade tests que pasen **hoy** y cubran el comportamiento actual, incluidos casos raros y errores.
- Si hay un bug conocido del que dependen consumidores, documenta su comportamiento actual con un test antes de cambiarlo.
- Usa `code-review-testing` para revisar estos tests.

### 3. Plan por pasos

Cada paso del plan se escribe así:

```markdown
#### Paso N — <verbo concreto>
- **Archivos:** `ruta/archivo.ext`
- **Cambio:** qué se extrae, renombra o mueve, y qué queda igual.
- **Contrato preservado:** exports / firma / retorno / errores exactos.
- **Verificación:** comando de test y linter que debe pasar tras este paso.
- **Rollback:** `git revert <commit>` o desactivar flag `X`.
```

### 4. Patrones recomendados

| Situación | Patrón |
|:---|:---|
| Función larga con varias responsabilidades | Extraer funciones puras con nombres de negocio; dejar el orquestador delgado. |
| Lógica duplicada | Extraer a módulo compartido; migrar un llamador por paso; borrar al final. |
| Cambio de librería o backend | Strangler: interfaz común, nueva implementación detrás de flag, migrar consumidores, retirar la vieja. |
| Objeto con muchos parámetros opcionales | Uniones discriminadas o builder con validación en un único punto. |
| Dependencias difíciles de testear | Inyección de dependencias en el límite, sin rediseñar todo el sistema. |
| Condiciones encadenadas | Tabla de decisión o early returns. |

### 5. Verificación final

- Suite completa, linter y análisis estático en verde.
- Diff revisado con `code-review-architecture` y `code-review-security` si aplica.
- Sin cambios en el contrato público salvo aprobación.
- Commits pequeños con mensaje que explique el "por qué".

## Formato de salida

```markdown
## Plan de refactor — <objetivo en una frase>

**Línea base:** `npm test` 122/122, `npm run lint` limpio.
**Contrato a preservar:** `createScribdService().download({url, format, quality})` y forma de `{ filePath, title, ... }`.

### Paso 1 — Añadir tests de caracterización
...

### Paso 2 — Extraer `finalizePageImage`
...

### Paso 3 — Migrar el segundo llamador y borrar el duplicado
...

**Riesgo principal:** ...
**Criterio de éxito:** todos los comandos en verde y el diff no cambia la API.
```

## Reglas

- No propongas reescrituras completas salvo que el coste de seguir igual esté demostrado.
- No renombres archivos y cambies lógica en el mismo paso.
- No introduzcas abstracciones "por si mañana": espera al segundo uso real.
- No prometas "sin riesgo": describe el riesgo y cómo se detecta.
- Si el usuario pide aplicar el plan, exige aprobación y vuelve al protocolo de desarrollo (Fases 2–4).

## Criterios de éxito

- Existe una línea base ejecutada antes de cualquier cambio.
- Los tests de caracterización se añaden antes del primer refactor.
- Cada paso tiene verificación y rollback.
- El contrato público queda explícitamente preservado.
