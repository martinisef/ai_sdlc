# CI · Bitbucket Cloud

## Archivos que instala /sdlc-setup
| Plantilla | Destino | Qué hace |
|---|---|---|
| `bitbucket/bitbucket-pipelines.yml` | `bitbucket-pipelines.yml` | PRs: build + review en paralelo, triage si falla · `change/**`: intent → spec · `main`: Jira a *merged* · custom: evals, control bands |

Todos los steps corren `npx -y @ai-native-sdlc/cli@0 ci <cmd>` sobre `node:22`: no hay script de CI para copiar.

Si ya existe `bitbucket-pipelines.yml`, mergeá los steps (`pull-requests`, `branches.change/**`, `custom.agent-evals`, `custom.control-bands`) sin borrar lo existente.
Completá los bloques `# >>> stack` (imagen y setup) desde `stacks/<lang>.md` → "CI · Bitbucket".
Sin Jira: sacá el step "Jira → merged". Sin Stage 6: sacá `custom.control-bands`.
En `.sdlc/config.json` completá `vcs.workspace` y `vcs.repo` (el remote puede no estar disponible en todos los contextos).

## Diferencias con GitHub/GitLab
- **Sin CLI oficial**: `sdlc vcs` usa la API REST 2.0 (crear PR, comentar, leer comentarios y statuses).
- **Review**: step con el agente headless (`claude -p`, o `ci.agent`) + comentario por API. No hay comentarios inline en el MVP: un comentario resumen con `archivo:línea`.
- **`@claude` en comentarios**: Pipelines no se dispara por comentarios. Requiere webhook "Pull request comment created" → servicio (Agent SDK). Fuera del MVP.
- **Draft PRs**: soportados por la API (`draft: true`); si el workspace no los tiene, el PR del intent se abre normal con "[intent]" en el título.

## Autenticación
- En CI: **repository access token** (`BITBUCKET_ACCESS_TOKEN`) con permisos *Pull requests: write* y *Repositories: write*. Como Bearer token.
- Local (para `/sdlc-ship`): el mismo tipo de token o `BITBUCKET_USER` (email de Atlassian) + `BITBUCKET_API_TOKEN` (API token con scopes de Bitbucket). Las app passwords están deprecadas.

## Configuración manual (agregar a SETUP.md)
1. **Repository variables** (secured): `ANTHROPIC_API_KEY`, `BITBUCKET_ACCESS_TOKEN`, `SDLC_PLUGIN_TOKEN` si aplica, `JIRA_EMAIL` + `JIRA_API_TOKEN`.
2. **Branch restrictions** en `main`: sin push directo, merge solo vía PR.
3. **Merge checks**: mínimo 1 aprobación, builds verdes. *Verificar en el plan del workspace* qué checks son obligatorios (en algunos planes son solo advertencias).
4. **Default reviewers** / code owners para `CLAUDE.md`, `REVIEW.md`, `.claude/`, `evals/` (disponibilidad según plan).
5. **Schedule** nocturno del pipeline custom `agent-evals` (y uno diario para `control-bands` con Stage 6).
6. Integración **Jira ↔ Bitbucket** activada en el sitio de Atlassian (linkea ramas y PRs con la key automáticamente).
