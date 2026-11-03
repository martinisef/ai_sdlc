<script setup>
import { withBase } from 'vitepress'
</script>

# Qué es, en 2 minutos

<video :src="withBase('/media/tutorial-es.mp4')" controls muted playsinline preload="metadata" style="width:100%;border-radius:8px">
  <track kind="subtitles" srclang="es" label="Español" :src="withBase('/media/tutorial-es.vtt')" default />
</video>

*El tutorial completo en menos de tres minutos ([abrir el video](https://martinisef.github.io/ai_sdlc/media/tutorial-es.mp4)). Los pasos del agente están acelerados; todo lo demás es la herramienta real.*

## El problema

Un agente de IA como Claude Code o Cursor escribe una funcionalidad en minutos. Lo difícil ya no es escribir el código: es asegurarse de que construya **lo correcto**, de que **una persona** lo haya aprobado antes de que exista el código, y de que **no pueda** hacer algo peligroso en el camino, como subir una contraseña o editar una migración de base de datos.

Pensalo como una obra. Los obreros (los agentes) son rapidísimos. Igual querés que un arquitecto firme los planos antes de levantar las paredes, y una valla alrededor del pozo. ai-native-sdlc son los planos firmados y la valla.

## Cómo funciona

Cada cambio pasa por el mismo camino corto. El agente escribe cada documento; vos lo leés y decís que sí o que no con un comando.

```text
 tu idea
    │  el agente escribe                          vos decidís
    ▼
 intent.md   el problema, en palabras simples  ──▶  sdlc approve … intent
    ▼
 spec.md     qué se va a construir             ──▶  sdlc approve … spec
    ▼
 plan.md     cómo se va a construir            ──▶  sdlc approve … plan
    ▼
 código + tests, después un pull request       ──▶  lo revisás y lo mergeás
```

- Cada documento es un archivo Markdown chico en `changes/<nombre>/`, commiteado en git, así que siempre queda registro de quién decidió qué.
- `sdlc next` siempre te dice lo único que hay que hacer ahora. Nunca tenés que acordarte en qué paso estás.
- Las cosas chicas (un typo, un texto) se saltean los documentos por el **carril rápido**.
- Los **guardrails** frenan al agente antes de que haga algo que nunca debería hacer. También aplican a las personas, con git hooks.

## Palabras que vas a ver

| Palabra | Qué significa |
|---|---|
| **Agente** | La IA que escribe por vos: Claude Code, Cursor, Codex u otro que lea `AGENTS.md`. |
| **Cambio** | Una unidad de trabajo, como "marcar una tarea como hecha". Vive en `changes/<fecha>-<nombre>/` y en la rama de git `change/<nombre>`. |
| **Intent** | `intent.md`: el problema, en palabras simples. Por qué lo queremos. |
| **Spec** | `spec.md`: qué se va a construir, como una lista de requisitos que se pueden verificar. |
| **Plan** | `plan.md`: qué archivos cambian, en qué orden, y cómo sabemos que funciona. |
| **Gate** | Un punto donde una persona tiene que decir que sí (`sdlc approve`) o que no (`sdlc reject`). Un agente nunca puede aprobar. |
| **Carril rápido** | El camino corto para cambios chicos: sin spec ni plan, con límites que se chequean en cada push. |
| **Guardrail** | Una regla que bloquea una acción antes de que pase: archivos protegidos, secretos, código antes de un plan aprobado. |
| **Preset** | Una configuración armada: `solo` (vos solo), `team-github` (un equipo en GitHub) o `regulated`. |
| **Skill** | Un comando para el agente, que escribís en su chat: `/sdlc-intent`, `/sdlc-plan`… |

## Qué necesitás

Una computadora con Node.js 22.18 o más nuevo, git y un agente de IA. [Instalar](./instalar) te guía con cada uno.

Siguiente: [Instalar](./instalar).
