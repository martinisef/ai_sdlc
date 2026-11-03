# Problemas frecuentes

Buscá el mensaje que ves y hacé lo que dice la columna de la derecha. Ante la duda, corré `npx sdlc doctor --fix`: arregla lo que puede y te dice lo que no.

## Al instalar

| Ves | Significa | Hacé esto |
|---|---|---|
| `npm WARN EBADENGINE` o un error de sintaxis al correr `npx sdlc` | Tu Node.js es anterior a 22.18. | `node -v`; instalá la versión LTS desde [nodejs.org](https://nodejs.org) y abrí una terminal nueva. |
| `sdlc: command not found` | Escribiste `sdlc` sin `npx`. | Usá `npx sdlc …`, o instalalo global con `npm i -g @morsadev/sdlc`. |
| `This repo is not set up for the loop → sdlc init` | Estás en una carpeta sin la herramienta. | Entrá a tu proyecto con `cd`, o corré `npx sdlc init`. |
| `✗ not a git repository` (en `doctor`) | La carpeta no es un repositorio git. | `git init -b main && git add -A && git commit -m initial`, y después `npx sdlc init` de nuevo. |
| `ai-sdlc: sdlc CLI not found (npm i -D @morsadev/sdlc); guardrail skipped` | El proyecto tiene los archivos de la herramienta pero no la herramienta (por ejemplo, después de clonarlo). | `npm install` (o `npm i -D @morsadev/sdlc`). |
| `! VCS provider unknown` | No hay un remoto de GitHub, GitLab ni Bitbucket. | Para probar está bien. Para pull requests, agregá el remoto (`git remote add origin …`) y corré `npx sdlc ci install --provider github`. |
| `! generated files edited by hand: …` | Alguien editó un archivo que genera la herramienta (skills, hooks). | `npx sdlc sync --force` los regenera. Tus notas van en `CLAUDE.md`. |

## Al aprobar

| Ves | Significa | Hacé esto |
|---|---|---|
| `… looks like an agent or bot; a person must approve` | Tu nombre o email de git son los del agente (por ejemplo `Claude <noreply@anthropic.com>`). | Poné los tuyos: `git config user.name "Tu Nombre"` y `git config user.email vos@ejemplo.com`, y aprobá de nuevo. |
| `sdlc: changes/…/spec.md does not exist` | Quisiste aprobar un documento que el agente todavía no escribió. | `npx sdlc next` dice cuál está pendiente; pedíselo al agente (`/sdlc-spec`). |
| `sdlc: change not found: …` | El nombre del cambio está mal. | `npx sdlc status` lista los nombres. Podés usar el nombre corto (`marcar-hecha`). |
| `… authored spec.md; another person must approve it` | En un preset de equipo, el autor de una spec o un plan no puede aprobarlo. | Pedíselo a alguien del equipo; lo ve en Aprobaciones, en el dashboard. |
| `plan needs approval from: …` | El preset dice quién aprueba cada documento, y no sos vos. | Pedíselo a alguna de las personas de la lista. |
| `git user.name / user.email is not set` | git no sabe quién sos. | `git config --global user.name "Tu Nombre"` y `git config --global user.email vos@ejemplo.com`. |

## Mientras trabaja el agente

| Ves | Significa | Hacé esto |
|---|---|---|
| `Bloqueado por ai-sdlc: la rama change/… tiene cambios de código pero …/plan.md no está aprobado` | Se subió código antes de aprobar el plan. | Terminá `/sdlc-plan` y `npx sdlc approve <cambio> plan`, y volvé a subir. |
| `Bloqueado por ai-sdlc: '…' es una ruta protegida` | El archivo es generado o sensible (`protected_paths` en `.sdlc/config.json`). | No lo esquives. Anotalo en `plan.md` y pedíselo a un code owner. |
| `Bloqueado por ai-sdlc: el contenido parece incluir una credencial` | El agente intentó escribir algo que parece una clave o una contraseña. | Leela de una variable de entorno. En datos de prueba, usá un valor que no parezca real. |
| `test-lock ON` | Hay un arreglo de bug en curso (`/sdlc-fix`): el test es la especificación. | Arreglá el código, no el test. `npx sdlc lock off` cuando termine el arreglo. |
| `promote it (sdlc promote …): … is a high-risk path` | Un cambio chico tocó algo riesgoso, o pasó de 10 archivos de código. | `npx sdlc promote`: el cambio pasa por intent, spec y plan. |
| El agente no conoce `/sdlc-…` | Faltan los archivos del agente, o el agente estaba abierto desde antes del `init`. | Reiniciá la sesión del agente. Si sigue fallando, `npx sdlc sync` y revisá `npx sdlc doctor`. |

## Deshacer

- **Una aprobación por error:** `npx sdlc reject <cambio> <intent|spec|plan> -m "por qué"` registra el rechazo. Pedile al agente que revise el documento y aprobalo de nuevo.
- **Un cambio que ya no querés:** `git checkout main`, después borrá su rama (`git branch -D change/<nombre>`) y su carpeta en `changes/`.
- **La herramienta entera:** borrá `.sdlc/`, `changes/`, las carpetas del agente que creó (`.claude/skills/sdlc-*`, `.agents/`) y corré `git config --unset core.hooksPath`.

¿Seguís trabado? Abrí un issue en [github.com/martinisef/ai_sdlc](https://github.com/martinisef/ai_sdlc/issues) con la salida de `npx sdlc doctor`.
