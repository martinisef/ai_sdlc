# CI · GitHub

## Archivos que instala /sdlc-setup
| Plantilla | Destino | Qué hace |
|---|---|---|
| `github/ci.yml` | `.github/workflows/ci.yml` | build + lint + test; si falla en un PR, triage con Claude comentado en el PR |
| `github/sdlc-review.yml` | `.github/workflows/sdlc-review.yml` | review con REVIEW.md en cada PR (`claude-code-action`) + `@claude` en comentarios |
| `github/sdlc-loop.yml` | `.github/workflows/sdlc-loop.yml` | intent aceptado → spec.md automática; PR mergeado → Jira a *merged* |
| `github/sdlc-evals.yml` | `.github/workflows/sdlc-evals.yml` | evals de configuración en PRs que tocan la configuración del agente + nightly |
| `github/sdlc-bands.yml` | `.github/workflows/sdlc-bands.yml` | solo Stage 6: `sdlc bands check` diario sobre `ops/bands.yaml` |

Todos los workflows llaman a `npx -y @ai-native-sdlc/cli@0 ci <cmd>` (Node 22 vía `actions/setup-node`): no hay script de CI para copiar. Fijá una versión (`@0.2.0`) si el equipo prefiere pipelines reproducibles antes que actualizaciones.

Si ya existe un `ci.yml`, no lo reemplaces: agregá el step de triage al job existente.
Completá los bloques `# >>> stack` con el setup del lenguaje (`stacks/<lang>.md` → "CI · GitHub").
Si el proyecto no usa Jira, sacá el job `jira-merged`.
Sin Stage 6 (todavía no hay métricas con baseline estable), no instales `sdlc-bands.yml`.
Otros agentes: el review usa `claude-code-action` (comentarios inline); con `ci.agent: codex|cursor`, reemplazá ese job por `npx -y @ai-native-sdlc/cli@0 ci review`, que publica un único comentario resumen.

## Configuración manual (agregar a SETUP.md)
1. **Secrets** (Settings → Secrets and variables → Actions): `ANTHROPIC_API_KEY` (o configurar Bedrock/Vertex/Foundry; `OPENAI_API_KEY` / `CURSOR_API_KEY` con `ci.agent` codex / cursor), `SDLC_PLUGIN_TOKEN` si el repo del marketplace es privado (token con read al repo), `JIRA_EMAIL` + `JIRA_API_TOKEN` si hay Jira.
2. **Claude GitHub App** instalada en el repo (la usa `claude-code-action`; `/install-github-app` desde Claude Code lo guía). Alternativa: el servicio gestionado de Code Review, que habilita un admin.
3. **Branch protection** en la default branch: PR obligatorio, 1 aprobación de code owner, checks `CI / build` requeridos, sin push directo.
4. **CODEOWNERS**: al menos `CLAUDE.md`, `REVIEW.md`, `.claude/**` y `evals/**` con dueños (los cambios a la configuración del agente se revisan como código).
5. **Actions → General → Workflow permissions**: permitir que `GITHUB_TOKEN` escriba (para que intent-to-spec pushee la spec a la rama `change/**` y bands pueda pushear `change/incident-*`). Para los PRs draft de bands, tildá también "Allow GitHub Actions to create and approve pull requests".

## Gate de merge por findings (opcional)
El review publica la línea `Important: N · Nit: M`. Un equipo que quiera bloquear merges con Important > 0 puede agregar un check que la lea; por defecto los findings solo informan.
