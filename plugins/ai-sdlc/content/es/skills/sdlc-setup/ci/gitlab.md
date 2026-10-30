# CI · GitLab

## Archivos que instala /sdlc-setup
| Plantilla | Destino | Qué hace |
|---|---|---|
| `gitlab/gitlab-ci.yml` | `.gitlab-ci.yml` (solo si no existe) | build + lint + test, triage si falla en un MR |
| `gitlab/sdlc.gitlab-ci.yml` | `ci/sdlc.gitlab-ci.yml` | review con REVIEW.md, intent → spec, Jira al mergear, evals, control bands (Stage 6) |

Todos los jobs corren `npx -y @ai-native-sdlc/cli@0 ci <cmd>` sobre `node:22`: no hay script de CI para copiar ni `jq` para instalar.

Si ya existe `.gitlab-ci.yml`: agregá `include: - local: ci/sdlc.gitlab-ci.yml` y los stages `review`, `loop`, `evals`. No lo reemplaces.
Completá el bloque `# >>> stack` (imagen + setup) desde `stacks/<lang>.md` → "CI · GitLab".
Sin Jira: sacá `sdlc:jira-merged`. Sin Stage 6: sacá `sdlc:bands`.

## Diferencias con GitHub
- **Review**: no hay equivalente de `claude-code-action`; el job corre el agente headless (`claude -p`, o `codex exec` / `cursor-agent` con `ci.agent`) y publica un comentario en el MR por API (`sdlc vcs` usa REST si no hay `glab`). Anthropic documenta una integración de Claude Code con GitLab CI/CD (beta): si el equipo la adopta, puede reemplazar `sdlc:review`.
- **`@claude` en comentarios del MR**: GitLab no dispara pipelines por comentarios. Requiere un webhook de "Comments" hacia un servicio (Agent SDK) que lance un pipeline o atienda el pedido. Queda como extensión, fuera del MVP.
- **Code Owners obligatorios y approval rules**: dependen del tier (Premium/Ultimate). En Free: protected branch + "Allowed to merge: Maintainers" y review por convención.

## Configuración manual (agregar a SETUP.md)
1. **Variables CI/CD**: `ANTHROPIC_API_KEY` (masked), `GITLAB_TOKEN` (project access token con scope `api` y rol Developer: comenta en MRs y pushea a `change/**`), `SDLC_PLUGIN_TOKEN` si el marketplace es privado, `JIRA_EMAIL` + `JIRA_API_TOKEN` si hay Jira.
2. **Protected branch** default: sin push directo, merge solo vía MR.
3. **Approval rules / CODEOWNERS** (Premium+): `CLAUDE.md`, `REVIEW.md`, `.claude/`, `evals/` con dueños.
4. **Pipeline schedule** nocturno (CI/CD → Schedules) para `sdlc:evals`; con Stage 6, un segundo schedule diario con la variable `SDLC_JOB=bands` para `sdlc:bands`.
5. Merge request settings: "Pipelines must succeed".
