---
name: sdlc-explain
description: Escribe o actualiza el explainer de un módulo en docs/explainers/ — qué hace, su arquitectura, los invariantes de los que depende el código y los riesgos de tocarlo, cada uno con evidencia file:line. No toca código. /sdlc-plan cita los explainers de los módulos que toca un plan. Usar cuando alguien pregunta cómo funciona un módulo, antes de planificar un cambio en código que nadie del equipo conoce bien, o cuando `sdlc explainers` marca uno como desactualizado.
argument-hint: "<ruta del módulo> [--refresh]"
---

# /sdlc-explain — lo que tenés que saber antes de cambiar un módulo

Objetivo: un reviewer solo puede juzgar un diff si sabe qué promete el código que lo rodea. El explainer lo deja escrito una vez, bajo demanda, para que planes y reviews se apoyen en él en lugar de redescubrirlo.

CLI del loop: `sdlc` ({{sdlc_hint}}).

## 0. Alcance
1. `$ARGUMENTS`: un directorio o archivo (`src/billing`). Si falta, preguntá cuál; ofrecé los directorios de código de primer nivel.
2. Archivo destino: `docs/explainers/<ruta con / reemplazado por ->.md` (`src/billing` → `docs/explainers/src-billing.md`).
3. Si ya existe, `sdlc explainers <módulo>`: si no está desactualizado y no hay `--refresh`, decí que está al día y pará. Si no, actualizalo conservando lo que sigue valiendo.
4. Solo lectura sobre el código: esta skill escribe únicamente el explainer.

## 1. Leer
- `git ls-files <módulo>`: puntos de entrada y superficie pública (exports, rutas, comandos, eventos).
- Los tests: lo que afirman es el comportamiento que alguien ya prometió.
- Quién lo llama: imports del módulo desde afuera. Eso es lo que se rompe cuando cambia.
- Configuración y entorno que lee; datos de los que es dueño (tablas, archivos, colas).
- `lessons/`, `changes/*/spec.md` y `git log --format='%h %s' -30 -- <módulo>` que lo mencionen: incidentes, reverts y decisiones pasadas.
- `.sdlc/config.json → risk.high_risk_paths`, `protected_paths` y el CODEOWNERS del módulo.

## 2. Escribir
```markdown
---
module: <ruta del módulo>
source_sha: <git log -1 --format=%h -- <módulo>>
updated: <AAAA-MM-DD>
---
# <módulo>: <qué es, una línea>

## Qué hace
<dos o tres oraciones; quién lo usa>

## Arquitectura
<piezas principales y cómo fluyen los datos entre ellas; un diagrama mermaid si ayuda>

## Invariantes
- <una regla de la que depende el código> — `archivo:línea`; la cuida `<test>` (o: sin test)

## Riesgos
- <qué se rompe fácil, por qué, y cómo apareció antes (lección, revert, incidente)>

## Cómo cambiarlo
- <por dónde empezar, qué tests correr (`.sdlc/config.json → commands`), quién es dueño>

## Preguntas abiertas
- <lo que el código no responde>
```
Reglas:
- Cada invariante y cada riesgo lleva evidencia `archivo:línea`. Si no podés señalar el código, va en Preguntas abiertas.
- "Sin test" al lado de un invariante es un hallazgo: decilo.
- Describí lo que el código hace hoy, no lo que debería hacer. No propongas cambios acá.
- Como mucho unas 150 líneas. Enlazá al código en vez de copiarlo.

## 3. Commit
Es documentación que la persona pidió, así que no necesita intent. Commiteá solo el explainer: `docs(explain): <módulo>`.

## Cierre
La ruta, cuántos invariantes no tienen test, y una línea: "`/sdlc-plan` lo va a citar cuando un plan toque <módulo>."
