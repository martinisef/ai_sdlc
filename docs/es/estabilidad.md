# Versiones y estabilidad

`@morsadev/sdlc` sigue [versionado semántico](https://semver.org/lang/es/) desde la 1.0.0. Dentro de la 1.x, una versión minor o patch nunca rompe lo que esta página lista como estable. ¿Venís de la 0.x? Mirá [Actualizar](./actualizar.md).

## Estable

Sobre lo que podés construir: scripts, jobs de CI, otras herramientas y tus propias skills.

| Superficie | Qué se mantiene en la 1.x |
|---|---|
| Comandos y flags del CLI | Todo comando y flag de `sdlc --help` que no esté marcado *experimental*. Se pueden agregar comandos y flags nuevos; los existentes mantienen su significado. |
| Códigos de salida | `0` éxito. `1` un error o un chequeo que falla (`doctor`, `quick --check`, `roadmap check`, un hook de git que bloquea). `2` un guardrail que bloquea en un hook del agente (`sdlc hook … --agent claude\|cursor`), como esperan los agentes. `3` el tracker no está configurado (`sdlc tracker`, `sdlc roadmap apply`). |
| Salidas `--json` | Las claves existentes mantienen su nombre y su tipo. Se pueden agregar claves nuevas, así que leelas por nombre. `sdlc status --json` imprime un objeto por línea (JSON Lines), una línea por cambio. |
| `.sdlc/config.json` | El schema que imprime `sdlc schema` (`version: 1`). Se pueden agregar campos opcionales; ningún campo cambia de significado ni pasa a ser obligatorio. |
| Artefactos | El frontmatter de `intent.md`, `spec.md` y `plan.md` (`status`, `approved_by`, `approved_at`, `ticket`, `risk`, `lane`, `origin`…), la estructura `changes/<YYYY-MM>-<slug>/` y las ramas `change/<slug>`. |
| Roadmaps | El formato de `changes/_roadmaps/<slug>/roadmap.md`: épicas `## E1 · …`, historias `### E1.S1 · …`, los campos `risk`, `depends`, `source`, `labels`, `key` y `links`, los criterios de aceptación `- [ ]` y las preguntas abiertas con respuestas `A:`. |
| Commits de gate | El trailer `Gate: <artefacto> <estado> by Nombre <email>`. Lo leen el CI y `sdlc ci gate-status`. |
| Hooks | `sdlc hook <evento> --agent claude\|cursor\|git` y los archivos que `sdlc sync` escribe para ellos. |
| Skills | Los nombres `/sdlc-*` y lo que produce cada una. Su redacción mejora entre versiones. |
| Node.js | `>=22.18`. Dejar de soportar una versión de Node requiere una versión major. |

## Experimental

Se puede usar, pero puede cambiar en una versión minor. Cada una aparece marcada *experimental* en `sdlc --help`.

| Superficie | Por qué |
|---|---|
| `sdlc hosted` | Es la fase 1 del [RFC del servicio hosted](../rfc/hosted.md); las fases 2 y 3 están abiertas. |
| `sdlc webhook` | Su configuración para GitLab y Bitbucket puede cambiar con el servicio hosted. |
| Codex y Cursor como agentes headless (`ci.agent`, `SDLC_CI_AGENT`, trabajos del dashboard) | Claude Code es la referencia; los otros CLIs tienen modelos de permisos más gruesos y cambian seguido. |
| La API HTTP del dashboard (`/api/*`) | Es interna de `sdlc ui`; la UI y el servidor se publican juntos. |
| El payload de telemetría | Apagada por defecto; los campos pueden cambiar ([Telemetry](../reference/telemetry.md)). |

## Deprecaciones

Algo estable se depreca durante al menos una versión minor antes de irse, y solo se va en una versión major:

1. Las notas de la versión dicen qué se depreca y qué lo reemplaza.
2. El CLI o `sdlc doctor` te avisan cuando lo usás.
3. Se quita en la siguiente versión major.

Deprecado hoy:

| Qué | En su lugar | Se quita en |
|---|---|---|
| `.claude/sdlc.json` (se sigue leyendo en toda la 1.x) | `.sdlc/config.json`: corré `sdlc migrate` o `sdlc doctor --fix` | 2.0 |
| `sdlc status --metrics` | `sdlc metrics` | 2.0 |

## Canales

| Tag de npm | Qué |
|---|---|
| `latest` | La versión estable: `npm i -D @morsadev/sdlc` |
| `rc` | Release candidates antes de una versión major: `npm i -D @morsadev/sdlc@rc` |

Cada versión tiene sus notas en [GitHub](https://github.com/martinisef/ai_sdlc/releases) y en el [changelog](https://github.com/martinisef/ai_sdlc/blob/main/packages/cli/CHANGELOG.md). Los paquetes se publican desde CI con npm provenance.
