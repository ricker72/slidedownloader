---
name: code-review-testing
description: Revisión de cobertura y calidad de pruebas: aserciones significativas, casos borde, errores y rutas negativas, determinismo y flakiness, fixtures y mocks, pruebas de integración y E2E, y trazabilidad entre requisito y prueba. Úsalo cuando se añadan o modifiquen tests, cuando un cambio carezca de cobertura o como perspectiva de la Fase 3 del protocolo de desarrollo. No modifica código.
---

# Revisión de testing

Perspectiva atómica de pruebas. Reporta al skill `code-review` cuando éste esté activo.

## Objetivo

Responder una sola pregunta: **¿este código podría romperse sin que ningún test lo detecte?** Una suite con 100 % de cobertura pero malas aserciones no responde esa pregunta.

## Cuándo activarse

- Tests nuevos o modificados.
- Cambios en lógica de negocio sin tests asociados.
- Correcciones de bugs (debe añadirse un test de regresión).
- Mocks, fixtures, relojes, aleatoriedad o tests end-to-end.
- Antes de fusionar o desplegar.

## Qué revisar

### Aserciones

- ¿La prueba fallaría si el comportamiento cambia? Comprobar que no solo "no lanza excepción".
- ¿Se comprueban valores concretos en vez de `toBeTruthy()` genérico?
- ¿Se aserciona el estado resultante y los efectos secundarios (llamadas, escrituras, eventos)?
- ¿Se prueba el contrato público (salida observable) en lugar de detalles de implementación?

### Casos

- Caso nominal, **caso negativo** y caso borde.
- Valores límite: vacío, cero, negativo, `null`/`undefined`, max, Unicode, fechas.
- Errores: timeout, red caída, 403/404/500, datos malformados, respuesta parcial.
- Idempotencia y repetición: llamar dos veces, orden inverso, concurrencia.
- Regresiones: cada bug corregido tiene un test que lo reproduzca.

### Aislamiento y determinismo

- ¿La prueba depende de hora real, aleatoriedad, orden de ejecución o estado global?
- ¿Comparte archivos, puertos, base de datos o caché con otras pruebas?
- ¿Los mocks son demasiado amplios y ocultan errores reales?
- ¿Se limpia el estado después de cada prueba (timers, listeners, archivos temporales)?
- ¿Hay `sleep` fijos en lugar de esperar una condición? (Preferir `waitFor`.)

### Estructura y utilidad

- Nombres que describen comportamiento: "rechaza una calidad desconocida con 400", no "test 3".
- Arrange–Act–Assert recognizable; una razón para fallar por prueba.
- Fixtures mínimas y reutilizables, sin copiar grandes bloques.
- Tests unitarios para lógica pura, integración para fronteras (BD/HTTP/archivos), E2E para flujos críticos de usuario.
- Cobertura medida pero no perseguida como objetivo único.

### Ejecución

- ¿El comando de test existe en `package.json`, `pyproject.toml` o equivalente y está documentado?
- ¿La suite completa pasa, no solo el archivo nuevo?
- ¿Hay tests omitidos (`skip`, `todo`, `.only`) sin justificación?

## Método

1. Lee el diff y el test correspondiente. Si no hay test, ese es el primer hallazgo.
2. Para cada rama nueva del código, busca una prueba que la ejecute.
3. Para cada prueba, cámbiale la aserción mentalmente: ¿seguiría pasando si el código estuviera roto?
4. Busca dependencias ocultas de tiempo, orden o entorno.
5. Ejecuta la suite si es posible y reporta el resultado real.
6. Propón el test mínimo que cerraría cada hueco.

## Formato de salida

```markdown
### [ALTO] Sin test de regresión para el fallback de host legacy
- **Ubicación:** `services/scribdService.js:1042`; falta en `tests/`
- **Evidencia:** el nuevo `if (status === 403)` no tiene prueba; la ruta anterior sí la tenía.
- **Impacto:** un cambio futuro puede romper el fallback y la suite seguirá en verde.
- **Corrección:** añadir test con `fakeTransport` que devuelva 403 en `html.scribdassets.com` y 200 en `html.scribd.com`, y asercionar que se usa el segundo host.
- **Bloquea merge:** sí
```

## Reglas

- No reportes "falta cobertura" sin decir qué comportamiento concreto no está cubierto.
- No pidas tests para getters triviales o código generado.
- No aceptes `expect(result).toBeDefined()` como prueba de comportamiento.
- Si no pudiste ejecutar la suite, indícalo como limitación y no digas "pasa".
- Distingue test unitario de integración: no propongas un E2E para una función pura.

## Criterios de éxito

- Cada hueco identificado tiene un test propuesto con nombre y aserciones.
- Se revisaron casos negativos y borde, no solo el camino feliz.
- Se comprobó determinismo y limpieza de estado.
- Se ejecutó la suite y se reportó el resultado real, o se declaró la limitación.
