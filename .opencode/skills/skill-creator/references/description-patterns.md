# Patrones para descripciones que enrutan

La descripción es lo único que ve el modelo en la lista de skills. Debe responder: **"¿Esto sirve para lo que me piden ahora?"**

## Fórmula

```text
[Verbo en tercera persona] + [objeto concretísimo] + [cuándo activarse] + [triggers].
```

Ejemplo correcto:

> "Revisa código en busca de vulnerabilidades de inyección SQL y sugiere parches concretos. Úsalo cuando se manejen consultas a base de datos, entrada de usuario o secretos. Triggers: auditoría de seguridad, pentest de código, revisar consultas."

## Patrones reutilizables

| Situación | Patrón de descripción |
|:---|:---|
| Skill de protocolo | "Protocolo obligatorio de N fases que debe cargarse ANTES de <acción>. Úsalo ante <lista>, incluso si parece trivial." |
| Skill de revisión | "Revisión de <perspectiva> centrada en <riesgos específicos>. Úsalo cuando <señales>. Devuelve <contrato de salida>; no modifica código." |
| Skill de creación | "Diseña y valida <artefacto>: <subtareas>. Úsalo cuando el usuario pida crear/mejorar/auditar <artefacto>." |
| Skill de operación | "Ejecuta <flujo> de forma segura con <controles>. Úsalo antes de <acción con efectos>." |

## Errores frecuentes

| ❌ Mal | ✓ Bien |
|:---|:---|
| "Ayuda con el código." | "Revisa código en busca de fugas de memoria y cuellos de botella en bucles y consultas." |
| "Herramientas útiles para desarrollo." | "Genera y valida servidores MCP en Python o TypeScript: define tools, esquemas de entrada y pruebas aisladas." |
| "Para cuando haya que hacer cosas de seguridad." | "Audit authentication, authorization and SSRF in HTTP handlers; use before merging endpoints that accept URLs." |
| "Skill de testing." | "Evalúa cobertura y calidad de aserciones, casos borde y determinismo de tests; úsalo cuando se añadan pruebas o se corrija un bug." |

## Reglas

- Tercera persona, presente, sin "yo", "tú" ni "usted".
- Un verbo principal fuerte: revisa, diseña, crea, valida, ejecuta, convierte.
- Nombra el entregable: informe, plan, archivos, comandos, diff.
- Nombra las señales de activación: tipos de archivo, acciones del usuario, errores frecuentes.
- Añade triggers en el idioma real del usuario, incluyendo palabras que usaría al escribir rápido: "arregla", "fix", " revisa ", "crea MCP".
- Si el skill debe cargarse antes de cada acción, dilo literalmente: **"ANTES de escribir, modificar o ejecutar…"**.
- No incluyas implementación en la descripción: eso va en el cuerpo.
- Si dos descripciones compiten por la misma situación, fusiona los skills o aclara el límite en ambas.

## Comprobación rápida

Lée la descripción en voz alta y responde:

1. ¿Sé exactamente qué produce?
2. ¿Sé exactamente cuándo cargarlo?
3. ¿Sé cuándo **no** cargarlo?
4. ¿La primera frase menciona un resultado verificable?

Si alguna respuesta es "no", reescríbela.
