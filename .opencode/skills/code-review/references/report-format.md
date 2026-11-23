# Formato de informe de revisión

Plantilla obligatoria para el skill `code-review`. Sealed para copiar/pegar.

```markdown
## Veredicto: LISTO PARA MERGE | LISTO CON CONDICIONES | BLOQUEADO

Una frase con el motivo principal.

### Hallazgos

#### [CRÍTICO|ALTO|MEDIO|BAJO|INFO] Título corto y concreto

- **Ubicación:** `ruta/archivo.ext:123`
- **Evidencia:** fragmento de 1–5 líneas o descripción exacta del flujo.
- **Impacto:** qué puede fallar, para quién y en qué condiciones.
- **Corrección:** cambio concreto, con código mínimo si ayuda.
- **Test:** prueba que demostraría el fallo y luego la corrección.
- **Bloquea merge:** sí | no

(repetir para cada hallazgo, ordenado por severidad)

### Verificado

- Lista de archivos leídos y aspectos comprobados sin hallazgos.
- Comandos ejecutados (linter, tipos, tests) y resultado.

### Perspectivas cargadas

- security / performance / architecture / testing / refactor: cargadas u omitidas (motivo).
```

## Reglas de redacción

- Un hallazgo = un problema. No agrupes tres bugs distintos en uno.
- El título dice el problema, no la solución: "IDOR en `/api/orders/:id`" mejor que "Añadir autorización".
- La corrección debe poder aplicarse sin leer toda la conversación.
- Si no hay hallazgos, dilo explícitamente: **"Sin hallazgos en el alcance revisado."** Nunca rellenes con comentarios genéricos.
- Si no pudiste leer un archivo o ejecutar una prueba, indícalo como limitación; no lo disimules.
