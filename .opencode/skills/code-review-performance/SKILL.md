---
name: code-review-performance
description: Revisión de código orientada a rendimiento: complejidad algorítmica, consultas N+1, memoria y fugas, E/S bloqueante, concurrencia descontrolada, caché, paginación, tamaño de bundle y cuellos de botella medibles. Úsalo cuando haya bucles, consultas, llamadas de red, procesamiento de datos o render frontend costoso, y como perspectiva de la Fase 3 del protocolo de desarrollo. Entrega hallazgos con impacto estimado y forma de medirlos; no modifica código.
---

# Revisión de rendimiento

Perspectiva atómica de rendimiento. Reporta al skill `code-review` cuando éste esté activo.

## Objetivo

Encontrar cuellos de botella **medibles** y proponer optimizaciones con evidencia. Nunca optimices a ciegas: mide o explica cómo se medirá.

## Cuándo activarse

- Bucles sobre colecciones grandes o transformaciones encadenadas.
- Consultas a base de datos o llamadas HTTP dentro de bucles (N+1).
- Concurrencia, promesas, hilos, colas o semáforos.
- Carga de imágenes, fuentes, bundles y render en frontend.
- Caché, memoización, paginación y límites de tamaño.
- Procesamiento de archivos, streams o buffers grandes.

## Qué revisar

### Algoritmos y datos

- Complejidad: bucles anidados, `includes`/`find` dentro de bucles, concatenación repetida de strings.
- Estructuras de datos inadecuadas (array donde hace falta Map/Set).
- Copias innecesarias de buffers o arrays grandes.
- Ordenación y filtrado repetidos sobre los mismos datos.

### Base de datos y red

- Consultas N+1; falta de `include`/`join` o batching.
- `SELECT *`, ausencia de paginación, `OFFSET` profundo.
- Índices ausentes en columnas de filtro/ordenación (verificar con `EXPLAIN`).
- Falta de timeouts, reintentos con backoff y límites de concurrencia.
- Peticiones secuenciales que podrían ser paralelas, o paralelas sin límite que agotan recursos.

### Memoria y recursos

- Fugas: listeners no removidos, timers, cachés sin expiración ni límite, closures que retienen objetos.
- Buffers o archivos completos en memoria cuando basta un stream.
- Cachés sin TTL, sin control de tamaño o con claves no acotadas (memory leak por crecimiento).
- Cierre de recursos: conexiones, streams, handles de archivo.

### Frontend

- Re-renders innecesarios; dependencias inestables en hooks; cálculos costosos sin memoizar.
- Imágenes sin dimensiones/lazy loading; fuentes bloqueantes; bundles sin dividir.
- Layout thrashing: leer y escribir estilos alternadamente en el mismo frame.
- Animaciones que no usan `transform`/`opacity` o que se ejecutan en el main thread.

### Medición

- ¿Existe benchmark, trace o perfil que justifique el cambio?
- ¿Hay métricas antes/después (tiempo, bytes, p95, número de consultas)?
- ¿El cambio mejora el caso común o solo un caso sintético?

## Método

1. Lee el código y describe el flujo caliente en una frase.
2. Identifica el coste dominante (CPU, E/S, memoria, red, render).
3. Estima el orden de magnitud con datos del repositorio (número de elementos, tamaños típicos).
4. Busca una métrica existente o propón cómo medirla (`console.time`, profiler, `EXPLAIN`, Lighthouse, trace).
5. Propón el cambio más pequeño con el mayor efecto, y explica el coste de mantenerlo.
6. Indica qué test de regresión de rendimiento o de comportamiento debe añadirse.

## Formato de salida

```markdown
### [ALTO] N+1 de consultas al listar documentos
- **Ubicación:** `services/reportService.js:118`
- **Evidencia:** `for (const doc of docs) await tags.find({ docId: doc.id })`.
- **Impacto:** 1 consulta por documento; con 200 documentos el endpoint pasa de ~30 ms a ~2–4 s.
- **Corrección:** una única consulta con `whereIn('docId', ids)` y agrupación en Map; o `include` del ORM.
- **Medición:** contar consultas con logger de BD antes/después; objetivo < 5 consultas.
- **Test:** test de integración que inserte 50 documentos y espere una sola consulta de tags.
- **Bloquea merge:** no
```

## Reglas

- No reportes micro-optimizaciones sin impacto medible.
- No propongas caché sin definir invalidación, TTL y límite de tamaño.
- No elimines legibilidad por un 1 % de mejora sin evidencia.
- Si el cuello está fuera del código revisado (CDN, red, DB compartida), dilo y no inventes una solución local.
- Separa "correctitud" de "rendimiento": un bug que produce datos erróneos va al skill de testing o arquitectura.

## Criterios de éxito

- Cada hallazgo incluye impacto estimado y método de medición.
- No se propusieron optimizaciones prematuras sin evidencia.
- Se revisaron complejidad, E/S, memoria y concurrencia.
- Se indicó la prueba de regresión necesaria.
