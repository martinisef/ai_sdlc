# CI · GitLab

## Archivos que instala /sdlc-setup
| Plantilla | Destino | Qué hace |
|---|---|---|
| `gitlab/gitlab-ci.yml` | `.gitlab-ci.yml` (solo si no existe) | build + lint + test, triage si falla en un MR |
| `gitlab/sdlc.gitlab-ci.yml` | `ci/sdlc.gitlab-ci.yml` | review y security review con REVIEW.md (status `sdlc/review`), intent → spec, Jira al mergear, evals, control bands (Stage 6) |

Todos los jobs corren `npx -y @morsadev/sdlc@0 ci <cmd>` sobre `node:22`: no hay script de CI para copiar ni `jq` para instalar.

Si ya existe `.gitlab-ci.yml`: agregá `include: - local: ci/sdlc.gitlab-ci.yml` y los stages `review`, `loop`, `evals`. No lo reemplaces.
Completá el bloque `# >>> stack` (imagen + setup) desde `stacks/<lang>.md` → "CI · GitLab".
`sdlc:tracker-merged` mueve el ticket y manda `change.merged`; sin tracker ni avisos no hace nada. Sin Stage 6: sacá `sdlc:bands`.

## Diferencias con GitHub
- **Review**: `sdlc:review` y `sdlc:security` corren el agente headless (`claude -p`, o `codex exec` / `cursor-agent` con `ci.agent`), publican discusiones inline y un resumen en el MR por API (`sdlc vcs` usa REST si no hay `glab`) y ponen el commit status `sdlc/review`. Una respuesta `resolved: <razón>` llega a `sdlc:review-status` a través de `sdlc webhook`; sin el servicio, el status se recalcula en el próximo pipeline. Anthropic documenta una integración de Claude Code con GitLab CI/CD (beta): si el equipo la adopta, puede reemplazar `sdlc:review`.
- **`@claude` en comentarios del MR**: GitLab no dispara pipelines por comentarios, así que lo hace un servicio chico: `sdlc webhook` (uno por organización; ver "@claude en comentarios" más abajo) recibe el webhook de "Comments" y dispara el job `sdlc:mention`, que corre `sdlc ci mention`. Sin el servicio, sacá `sdlc:mention`.
- **Code Owners obligatorios y approval rules**: dependen del tier (Premium/Ultimate). En Free: protected branch + "Allowed to merge: Maintainers" y review por convención.

## Configuración manual (agregar a SETUP.md)
1. **Variables CI/CD**: `ANTHROPIC_API_KEY` (masked), `GITLAB_TOKEN` (project access token con scope `api` y rol Developer: comenta en MRs y pushea a `change/**`), `SDLC_PLUGIN_TOKEN` si el marketplace es privado, `JIRA_EMAIL` + `JIRA_API_TOKEN` si hay Jira, `LINEAR_API_KEY` con Linear, `SDLC_NOTIFY_WEBHOOK` para [avisos](https://martinisef.github.io/ai_sdlc/es/avisos).
2. **Protected branch** default: sin push directo, merge solo vía MR.
3. **Approval rules / CODEOWNERS** (Premium+): `CLAUDE.md`, `REVIEW.md`, `.claude/`, `evals/` con dueños.
4. **Pipeline schedule** nocturno (CI/CD → Schedules) para `sdlc:evals`; con Stage 6, un segundo schedule diario con la variable `SDLC_JOB=bands` para `sdlc:bands`.
5. Merge request settings: "Pipelines must succeed" (`sdlc/review` y `sdlc/gates` son commit statuses del commit del pipeline).

## @claude en comentarios
1. Corré el servicio donde GitLab lo alcance (HTTPS): `docker run -p 8787:8787 -e SDLC_WEBHOOK_SECRET=… -e GITLAB_TRIGGER_TOKEN=… ghcr.io/martinisef/sdlc-webhook`, o `npx -y @morsadev/sdlc@0 webhook` en cualquier host con Node ≥ 22.
2. Proyecto (o grupo) → Settings → Webhooks: URL `https://<host>/gitlab`, Secret token = `SDLC_WEBHOOK_SECRET`, trigger **Comments**.
3. Settings → CI/CD → Pipeline trigger tokens: creá uno y pasáselo al servicio como `GITLAB_TRIGGER_TOKEN` (un servicio por proyecto, o uno por grupo con un token compartido).
4. Opcional: `SDLC_ALLOWED_AUTHORS=ana,juan` limita quién puede disparar al agente; `SDLC_MENTION=@agent` cambia la mención.

El comentario es input no confiable. Por defecto el agente solo responde (`ci.mention_mode: read`); con `edit` puede commitear cambios dentro del plan aprobado en la rama del MR, y los guardrails siguen aplicando. Las respuestas van marcadas para que nunca vuelvan a disparar al agente.
