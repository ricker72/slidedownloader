---
name: code-review-architecture
description: Revisión de arquitectura y diseño de software: acoplamiento y cohesión, principios SOLID, límites entre capas, dirección de dependencias, contratos de API y tipos, duplicación, manejo de errores, configuración y deuda técnica. Úsalo cuando se creen módulos, servicios, interfaces o capas, o como perspectiva de la Fase 3 del protocolo de desarrollo. Propone mejoras incrementales sin romper contratos públicos; no modifica código.
---

# Revisión de arquitectura

Perspectiva atómica de diseño. Reporta al skill `code-review` cuando éste esté activo.

## Objetivo

Detectar decisiones de diseño que encarecerán el cambio futuro, y proponer la corrección **incremental** más segura. Arquitectura útil es la que reduce el coste del próximo cambio, no la que luce elegante en un diagrama.

## Cuándo activarse

- Nuevos módulos, servicios, controladores, repositorios o capas.
- Cambios en interfaces, tipos de datos, esquemas o contratos de API.
- Crecimiento de un archivo o función "que hace de todo".
- Duplicación de lógica entre módulos.
- Configuración, feature flags o dependencias entre servicios.
- Refactorizaciones y migraciones.

## Qué revisar

### Cohesión y acoplamiento

- ¿Este módulo tiene una sola razón para cambiar (SRP)?
- ¿Depende de detalles concretos en lugar de abstracciones (DIP)?
- ¿Un cambio en A obliga a tocar B, C y D? (Alto acoplamiento.)
- ¿Hay dependencias circulares o imports cruzados entre capas?
- ¿La dirección de dependencias apunta hacia el dominio, no hacia frameworks o infraestructura?

### Interfaces y contratos

- ¿Los tipos y esquemas representan estados inválidos? Preferir uniones discriminadas sobre campos opcionales contradictorios.
- ¿Se valida en el límite del sistema (entrada HTTP, mensaje, archivo) y se confía dentro?
- ¿Los errores son tipados y accionables o son strings genéricos?
- ¿La API pública es estable? ¿Hay cambios breaking sin plan de migración?
- ¿Los nombres describen intención de negocio en vez de implementación?

### Duplicación y deuda

- Duplicación real (misma regla de negocio en dos sitios) vs duplicación accidental (código parecido que debe divergir).
- Constantes mágicas, valores repetidos y configuración dispersa.
- Comentarios que contradicen el código; código muerto; `@ts-ignore` o supresiones sin justificación.
- Funciones o clases que superan ampliamente el tamaño razonable del proyecto.

### Errores y resiliencia

- ¿Se pierden causas de error al hacer `catch {}` o convertir todo en 500?
- ¿Los errores de infraestructura y de negocio se distinguen para el llamador?
- ¿Hay timeouts, reintentos y degradación graceful en las fronteras?
- ¿Las transacciones y los efectos secundarios están bien delimitados?

### Operabilidad

- ¿Se puede observar el flujo (logs estructurados, métricas, trazas) sin añadir debugging temporal?
- ¿La configuración viene de entorno con valores por defecto seguros?
- ¿El despliegue y las migraciones son reproducibles?

## Método

1. Dibuja mentalmente el flujo: entrada → capas → salida. Escríbelo en una frase.
2. Marca los límites de confianza y los contratos entre capas.
3. Busca el cambio hipotético más probable en los próximos 6 meses y evalúa cuántos archivos tocaría.
4. Identifica la deuda con mayor coste de interés, no la más molesta.
5. Propón un paso incremental con tests de caracterización antes del refactor.
6. Indica explícitamente qué contrato público se conserva.

## Formato de salida

```markdown
### [MEDIO] Regla de precios duplicada en dos servicios
- **Ubicación:** `services/pricing.js:57`, `services/checkout.js:102`
- **Evidencia:** ambos calculan el descuento con la misma tabla hardcodeada.
- **Impacto:** cambiar la política obliga a editar dos sitios; ya divergieron en el manejo de cupones.
- **Corrección:** extraer `calculateDiscount()` a `domain/pricing.js`, con tests de caracterización; los dos servicios pasan a importarlo. Paso 1: añadir el módulo sin borrar el código antiguo. Paso 2: migrar un servicio. Paso 3: migrar el otro y eliminar duplicados.
- **Contrato conservado:** firma y forma de retorno de `checkout()` no cambian.
- **Test:** test de caracterización que congele los resultados actuales antes del paso 1.
- **Bloquea merge:** no
```

## Reglas

- No propongas "crear una interfaz para todo": justifica cada abstracción con un cambio real o al menos dos usos.
- No mezcles seguridad o rendimiento aquí; usa sus sub-skills específicos.
- Respeta las convenciones existentes antes que la teoría: si el proyecto es modular por dominio, no lo reorganiches por capas en una revisión.
- Nombra el coste de la deuda, no solo su existencia.
- Prefiere pasos pequeños y revertibles sobre reescrituras.

## Criterios de éxito

- Se evaluaron acoplamiento, contratos, duplicación y errores.
- Cada recomendación tiene un paso incremental y un contrato conservado.
- No se propuso una abstracción sin uso real.
- Se distingue deuda crítica de deuda aceptable.
