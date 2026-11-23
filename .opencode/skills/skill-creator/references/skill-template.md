# Plantilla de SKILL.md

Copiar y rellenar. Mantener por debajo de ~500 líneas; mover el detalle a `references/`.

```markdown
---
name: nombre-para-el-usuario
description: [<QUÉ HACE>] + [<CUÁNDO ACTIVARSE>] + [triggers en el idioma del usuario]. Tercera persona, sin "ayuda con".
---

# <Resultado que produce>

Una frase: qué entregable produce y cómo se verifica.

## Cuándo usarlo

- <Situación concreta 1>
- <Situación concreta 2>
- <Señal de que NO aplica>

## Entrada

Qué necesita el skill para empezar (archivos, datos, decisión del usuario).
Si falta algo, pregunta; no inventes.

## Método

1. **Paso 1 — <verbo>**. Qué hacer y con qué herramienta.
2. **Paso 2 — <verbo>**. Criterio para pasar al siguiente paso.
   Lee `references/<tema>.md` si <condición>.
3. **Paso 3 — <verbo>**. Cómo verificar el resultado.

## Contrato de salida

Formato exacto del entregable (para que otros skills puedan agregarlo):

```markdown
### [SEVERIDAD] <Título>
- **Ubicación:** `archivo:línea`
- **Evidencia:** ...
- **Impacto:** ...
- **Corrección:** ...
- **Test:** ...
```

## Criterios de éxito

- [ ] ...
- [ ] ...

## Reglas

- No <anti-patrón 1>.
- No <anti-patrón 2>.
- Si <condición>, detente y pregunta.
```

## Estructura de directorio recomendada

```text
~/.config/opencode/skills/mi-skill/
├── SKILL.md
├── references/
│   ├── api-guia.md
│   └── ejemplos.md
├── scripts/
│   └── validar.sh
└── templates/
    └── salida.md
```

Reglas:

- Los scripts son auxiliares: el skill debe explicar cuándo ejecutarlos y cómo interpretar la salida.
- Las referencias se leen bajo demanda, nunca todas de golpe.
- Los templates se copy/pegan; no hace falta leerlos enteros para entender el skill.
- Si un script necesita dependencias, documéntalas y verifícalas en la validación.
