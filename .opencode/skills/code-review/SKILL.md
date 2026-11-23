---
name: code-review
description: Orquestador de revisión de código que coordina los sub-skills atómicos de seguridad, rendimiento, arquitectura, testing y refactorización, y entrega un único informe priorizado con hallazgos accionables. Úsalo cuando el usuario pida revisar, auditar o evaluar calidad de código, antes de fusionar un cambio, o como parte de la Fase 3 del protocolo de desarrollo. No modifica código por sí mismo.
---

# Revisión de código (orquestador)

Convierte varias perspectivas de revisión en **un solo informe priorizado y accionable**. Es el skill principal al que reportan los sub-skills; nunca sustituye su lectura real del código.

## Cuándo usarlo

- El usuario pide "revisa este código", "audita", "¿ está listo para merge ?".
- Hay un cambio reciente que debe pasar la Fase 3 del protocolo de desarrollo.
- Se quiere una segunda opinión antes de desplegar.

## Reglas de oro

1. **Lee antes de opinar.** Nunca reportes un hallazgo sin haber abierto el archivo. Nunca inventes números de línea.
2. **Sin cambios por defecto.** Este skill informa; no edita archivos salvo que el usuario lo pida explícitamente (y entonces, bajo el protocolo de desarrollo).
3. **Evidencia o silencio.** Cada hallazgo incluye `archivo:línea`, el fragmento relevante y el impacto concreto.
4. **Sin ruido.** No reportes preferencias personales de estilo como hallazgos salvo que el proyecto las defina en linter o guía.
5. **Prioriza con criterio.** Un hallazgo crítico de seguridad supera a diez nitpicks.

## Flujo

### 1. Delimitar el alcance

- Determina qué archivos o qué diff se revisará (git diff, carpeta, archivos mencionados).
- Identifica lenguaje(s), framework(s) y contratos públicos (API, tipos, esquemas).
- Si el alcance es ambiguo, pregunta antes de continuar.

### 2. Cargar perspectivas

Carga los sub-skills según el contexto. No es obligatorio cargar todos, pero sí al menos los que el cambio toca:

| Sub-skill | Activarlo cuando… |
|:---|:---|
| `code-review-security` | Hay entrada de usuario, autenticación, red, archivos, secretos, crypto o dependencias. |
| `code-review-performance` | Hay bucles, consultas, E/S, concurrencia, caché, memoria o frontend con render costoso. |
| `code-review-architecture` | Hay nuevos módulos, interfaces, capas, acoplamiento o deuda técnica. |
| `code-review-testing` | Hay tests nuevos o modificados, o el cambio carece de cobertura. |
| `code-improvement-refactor` | El usuario pide propuestas de mejora sin romper la API pública. |

Cada sub-skill devuelve sus hallazgos en el mismo formato (ver abajo). Tú los agregas, deduplicas y priorizas.

### 3. Agregar y priorizar

- Fusiona hallazgos duplicados conservando la evidencia más precisa.
- Asigna severidad: **Crítico**, **Alto**, **Medio**, **Bajo**, **Info**.
- Ordena por severidad y luego por impacto en el usuario.
- Separa "bloquea el merge" de "puede esperar".

### 4. Emitir el informe

Usa el formato de [`references/report-format.md`](references/report-format.md).

Como mínimo, el informe contendrá:

- Resumen de una línea: **listo para merge / listo con condiciones / bloqueado**.
- Hallazgos priorizados con `archivo:línea`, evidencia, impacto y corrección concreta.
- Tests recomendados para cada hallazgo importante.
- Una lista explícita de lo que **sí** se verificó (para no dar la impresión de que no se miró nada).

### 5. Cerrar

- Indica qué sub-skills se cargaron y cuáles se omitieron y por qué.
- Si el usuario quiere que se apliquen las correcciones, vuelve a la Fase 2 del protocolo de desarrollo: plan, aprobación y validación antes de editar.

## Criterios de éxito

- El informe es corto, técnico y sin especulación.
- Todo hallazgo tiene evidencia verificable y una corrección accionable.
- No se modificó código sin aprobación.
- Se distingue claramente entre bloqueante y recomendación.
