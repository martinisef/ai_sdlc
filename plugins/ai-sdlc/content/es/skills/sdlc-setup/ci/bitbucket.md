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
- **`@claude` en comentarios**: Pipelines no se dispara por comentarios, así que lo hace un servicio chico: `sdlc webhook` (uno por workspace; ver "@claude en comentarios" más abajo) recibe el webhook "Pull request: Comment created" y corre el custom pipeline `sdlc-mention`, que corre `sdlc ci mention`. Sin el servicio, sacá `sdlc-mention`.
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

## @claude en comentarios
1. Corré el servicio donde Bitbucket lo alcance (HTTPS): `docker run -p 8787:8787 -e SDLC_WEBHOOK_SECRET=… -e BITBUCKET_ACCESS_TOKEN=… ghcr.io/martinisef/sdlc-webhook`, o `npx -y @ai-native-sdlc/cli@0 webhook` en cualquier host con Node ≥ 22.
2. Repository (o workspace) settings → Webhooks: URL `https://<host>/bitbucket`, Secret = `SDLC_WEBHOOK_SECRET`, trigger **Pull request: Comment created**.
3. Dale al servicio un token que pueda correr pipelines (`BITBUCKET_ACCESS_TOKEN`, access token de repositorio o workspace con Pipelines write).
4. Opcional: `SDLC_ALLOWED_AUTHORS=ana,juan` limita quién puede disparar al agente; `SDLC_MENTION=@agent` cambia la mención.

El comentario es input no confiable. Por defecto el agente solo responde (`ci.mention_mode: read`); con `edit` puede commitear cambios dentro del plan aprobado en la rama del PR, y los guardrails siguen aplicando. Las respuestas van marcadas para que nunca vuelvan a disparar al agente.
