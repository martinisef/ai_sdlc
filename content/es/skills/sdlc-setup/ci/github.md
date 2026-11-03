# CI · GitHub

## Archivos que instala /sdlc-setup
| Plantilla | Destino | Qué hace |
|---|---|---|
| `github/ci.yml` | `.github/workflows/ci.yml` | build + lint + test; si falla en un PR, triage con Claude comentado en el PR |
| `github/sdlc-review.yml` | `.github/workflows/sdlc-review.yml` | review con REVIEW.md en cada PR (`sdlc ci review`: finders, verificador, comentarios inline), commit status `sdlc/review`, respuestas `resolved: <razón>` + `@claude` en comentarios |
| `github/sdlc-security.yml` | `.github/workflows/sdlc-security.yml` | security review de solo lectura en cada PR (`sdlc ci security`); los findings de seguridad abiertos dejan `sdlc/review` en rojo |
| `github/sdlc-gates.yml` | `.github/workflows/sdlc-gates.yml` | `/approve spec`, `/reject plan …` en comentarios del PR → commit del gate; commit status `sdlc/gates` (hacelo requerido) |
| `github/sdlc-loop.yml` | `.github/workflows/sdlc-loop.yml` | intent aceptado → spec.md automática; PR mergeado → Jira a *merged* |
| `github/sdlc-evals.yml` | `.github/workflows/sdlc-evals.yml` | evals de configuración en PRs que tocan la configuración del agente + nightly |
| `github/sdlc-bands.yml` | `.github/workflows/sdlc-bands.yml` | solo Stage 6: `sdlc bands check` diario sobre `ops/bands.yaml` |

Todos los workflows llaman a `npx -y @morsadev/sdlc@0 ci <cmd>` (Node 22 vía `actions/setup-node`): no hay script de CI para copiar. Fijá una versión (`@0.2.0`) si el equipo prefiere pipelines reproducibles antes que actualizaciones.

Si ya existe un `ci.yml`, no lo reemplaces: agregá el step de triage al job existente.
Completá los bloques `# >>> stack` con el setup del lenguaje (`stacks/<lang>.md` → "CI · GitHub").
El job `tracker-merged` mueve el ticket (Jira, GitHub Issues o Linear) y manda `change.merged`; sin tracker ni avisos no hace nada.
Sin Stage 6 (todavía no hay métricas con baseline estable), no instales `sdlc-bands.yml`.
Otros agentes: con `ci.agent: codex|cursor`, pasale `OPENAI_API_KEY` / `CURSOR_API_KEY` a los jobs de review y security en lugar de `ANTHROPIC_API_KEY`. El job de `@claude` sigue usando `claude-code-action`.

## Configuración manual (agregar a SETUP.md)
1. **Secrets** (Settings → Secrets and variables → Actions): `ANTHROPIC_API_KEY` (o configurar Bedrock/Vertex/Foundry; `OPENAI_API_KEY` / `CURSOR_API_KEY` con `ci.agent` codex / cursor), `SDLC_PLUGIN_TOKEN` si el repo del marketplace es privado (token con read al repo), `JIRA_EMAIL` + `JIRA_API_TOKEN` si hay Jira, `LINEAR_API_KEY` con Linear, `SDLC_NOTIFY_WEBHOOK` para [avisos](https://martinisef.github.io/ai_sdlc/es/avisos).
2. **Claude GitHub App** instalada en el repo (la usa `claude-code-action` para `@claude`; `/install-github-app` desde Claude Code lo guía). Alternativa: el servicio gestionado de Code Review, que habilita un admin.
3. **Branch protection** en la default branch: PR obligatorio, 1 aprobación de code owner, checks `CI / build`, `sdlc/gates` y `sdlc/review` requeridos, sin push directo.
4. **CODEOWNERS**: al menos `CLAUDE.md`, `REVIEW.md`, `.claude/**` y `evals/**` con dueños (los cambios a la configuración del agente se revisan como código).
5. **Actions → General → Workflow permissions**: permitir que `GITHUB_TOKEN` escriba (para que intent-to-spec pushee la spec a la rama `change/**` y bands pueda pushear `change/incident-*`). Para los PRs draft de bands, tildá también "Allow GitHub Actions to create and approve pull requests".

## Gate de merge por findings
`sdlc/review` falla mientras haya un finding Important abierto (o uno de seguridad que no sea pre-existente). Un finding se cierra cuando la ronda siguiente lo ve arreglado, o cuando alguien con permiso de escritura responde `resolved: <razón>` a su comentario inline (también sirve `resolved f2: <razón>` en un comentario del PR); el job `resolve` recalcula el status. Exigí `sdlc/review` en la branch protection para que los merges lo esperen. Los nits y los pre-existentes nunca bloquean.
