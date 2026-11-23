---
name: skill-creator
description: Diseña, crea y valida Skills y sub-skills de agencia de IA que cualquier modelo puede cargar antes de actuar: define el resultado verificable, escribe descripciones que actúan como enrutador, aplica divulgación progresiva, elige la ubicación correcta y prueba la activación del skill. Úsalo cuando el usuario pida crear, mejorar, auditar u organizar un Skill, sub-skill o catálogo de skills, o cuando haya que convertir un prompt repetido en un skill reutilizable.
---

# Creador de Skills y sub-skills

Convierte una necesidad repetida en un **skill** que el modelo descubre y carga por su descripción. No es documentación: es una instrucción ejecutable.

## Principio central

> Un Skill = un resultado de negocio verificable.

Ni un monolito que lo abarque todo, ni diez fragmentos minúsculos que rompan el contexto. La fórmula:

**un resultado claro + un escenario de activación + un método cohesionado + un entregable verificable.**

Antes de crear nada, escribe en una frase: *"Cuando <situación>, este skill produce <entregable> y se considera exitoso si <criterio>."* Si no puedes, todavía no es un skill.

## Formato mínimo

```markdown
---
name: nombre-legible
description: Describe qué hace y, sobre todo, CUÁNDO debe activarse. Tercera persona.
---

# Título

## Cuándo usarlo
...

## Método
1. ...

## Criterios de éxito
- ...
```

- `name`: etiqueta de presentación. El **ID** real se deriva de la ruta del archivo, no del frontmatter.
- `description`: es el clasificador de enrutamiento. Sin descripción, el modelo no ve el skill.
- Cuerpo: pasos accionables, ejemplos y criterios de éxito.

Para una plantilla completa, lee [`references/skill-template.md`](references/skill-template.md). Para escribir descripciones, lee [`references/description-patterns.md`](references/description-patterns.md).

## Reglas de diseño

### 1. La descripción es el disparador

Específica, en tercera persona, con verbs y contexto. No vale "ayuda con código". Vale:

> "Revisa código en busca de vulnerabilidades de inyección SQL y sugiere parches concretos. Úsalo cuando se manejen consultas, entrada de usuario o secretos."

Incluye sinónimos y triggers del usuario, en el idioma en que el usuario suele escribir. Ver patrón completo en la referencia.

### 2. Divulgación progresiva

- `SKILL.md` por debajo de ~500 líneas. Ideal: 100–250.
- El detalle largo va en `references/`, `scripts/` o `templates/` junto al `SKILL.md`.
- El skill debe indicar explícitamente cuándo leer cada archivo: "Lee `references/api.md` antes de llamar a la API".
- No cargues referencias "por si acaso": solo cuando el paso lo pida.

### 3. Un skill, un resultado

Señales de que hay que dividir:

- El cuerpo tiene dos secciones grandes sin relación (ej. "revisar seguridad" y "generar changelog").
- La descripción necesita un "o" para explicar cuándo usarlo.
- Distintos usuarios querrían solo una parte.

Señales de que hay que fusionar:

- Dos skills siempre se cargan juntos.
- Uno solo existe para decir "lee el otro".

### 4. Sub-skills

Los sub-skills son perspectivas atómicas que reportan a un skill principal, no atajos para dividir texto.

- El principal delimita alcance, carga las perspectivas relevantes, deduplica y prioriza.
- Cada sub-skill define: cuándo activarse, qué revisar, método, formato de salida y criterios de éxito.
- Todos los sub-skills devuelven el **mismo contrato de salida** para que el principal pueda agregarlos.
- Ejemplo canónico: `code-review` + `code-review-security`, `-performance`, `-architecture`, `-testing`, `code-improvement-refactor`.

### 5. herramientas como ciudadanos de primera clase

Si el skill necesita acciones (leer archivos, consultar APIs, ejecutar tests), prefiere herramientas MCP separadas antes que scripts frágiles embebidos:

- Pocas y precisas, con nombres claros (`get_document`, no `do_thing`).
- Descripciones tan detalladas como la documentación de un compañero nuevo.
- Errores auto-corregibles: dicen qué falló, qué se esperaba y cómo corregirlo.
- Validación de entrada con esquemas y mensajes de error accionables.

Usa `mcp-server-builder` para diseñarlas.

## Ubicación e ID (OpenCode)

Fuentes detectadas automáticamente, de menor a mayor precedencia:

| Ámbito | Ruta |
|:---|:---|
| Global | `~/.config/opencode/skills` |
| Compatibilidad global | `~/.claude/skills`, `~/.agents/skills` |
| Proyecto | `.opencode/skills` |
| Compatibilidad proyecto | `.claude/skills`, `.agents/skills` |

Formatos admitidos:

```text
skills/
├── review.md                    → ID: review
└── git-release/
    └── SKILL.md                 → ID: git-release
```

- El ID es la ruta, en kebab-case, sensible a mayúsculas. Usa `^[a-z0-9]+(-[a-z0-9]+)*$`.
- Un directorio con `SKILL.md` es **un** skill; OpenCode no busca más dentro.
- Las rutas escritas dentro del skill son relativas al directorio que contiene `SKILL.md`.
- Para compartir skills entre proyectos, usa el array `skills` de `opencode.json(c)` (rutas locales o catálogo HTTP con `index.json`).

## Flujo de creación (bajo el protocolo de desarrollo)

1. **Fase 1.** Identifica el resultado verificable y el disparador. Revisa los skills existentes para no duplicar IDs.
2. **Fase 2.** Propón: ID, descripción, ámbito (global/proyecto), archivos y contrato de salida. Espera aprobación.
3. **Fase 3.** Escribe `SKILL.md` y sus referencias. Ejecuta la validación de abajo. Corrige hasta que esté limpia.
4. **Fase 4.** Carga el skill con la herramienta `skill` y haz un dry-run: comprueba que se anuncia, que se carga y que las referencias existen.

## Validación obligatoria antes de darlo por terminado

Ejecuta el validador sin dependencias (acepta IDs opcionales para validar solo los nuevos):

```sh
node scripts/validate-skills.mjs ~/.config/opencode/skills <id1> <id2>
```

- [ ] El ID es kebab-case, único y coincide con el directorio.
- [ ] El frontmatter tiene `name` y `description`; la descripción dice claramente **cuándo** activarse.
- [ ] El cuerpo tiene "Cuándo usarlo", método y criterios de éxito.
- [ ] `SKILL.md` tiene menos de ~500 líneas.
- [ ] Todas las rutas relativas existen.
- [ ] No contiene secretos, tokens ni rutas absolutas de usuario.
- [ ] No contradice ni duplica otro skill del mismo ámbito.
- [ ] Se cargó con `skill(id)` y sus instrucciones son ejecutables sin contexto adicional.
- [ ] El entregable es verificable en una frase.

## Anti-patrones

- Descripción vaga: "Ayuda con la programación".
- Skill que solo contiene enlaces a documentación externa.
- Referencias que nunca se leen porque el `SKILL.md` no dice cuándo hacerlo.
- Cinco sub-skills para una revisión de una sola perspectiva.
- Duplicar un skill existente con otro ID.
- Meter reglas de otro skill "por si acaso".
