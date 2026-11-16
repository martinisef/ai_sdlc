# `.sdlc/config.json` — contrato

Lo leen los guardrails (`sdlc hook`, para cualquier agente), las skills del loop, el dashboard (`sdlc ui`) y el CI (`sdlc ci`). JSON Schema: `sdlc schema`. Proyectos anteriores con `.claude/sdlc.json` se siguen leyendo (`sdlc migrate` lo mueve). Todas las claves son opcionales salvo `version`; si falta el archivo, los hooks no hacen nada.

```json
{
  "version": 1,
  "locale": "es",
  "agents": ["claude", "cursor", "agents-md"],
  "vcs": {
    "provider": "github | gitlab | bitbucket",
    "host": "github.com | gitlab.miempresa.com | bitbucket.org",
    "workspace": "solo bitbucket: workspace",
    "repo": "solo bitbucket: repo slug",
    "default_branch": "main"
  },
  "tracker": {
    "provider": "jira | github | linear | none",
    "mode": "linkage | jira-sot | repo-sot",
    "base_url": "https://miorg.atlassian.net",
    "project_key": "PROJ",
    "default_issue_type": "Task",
    "incident_issue_type": "Bug",
    "transitions": {
      "intent": "To Do",
      "spec": "In Design",
      "plan": "In Progress",
      "ship": "In Review",
      "merged": "Done"
    }
  },
  "stack": { "language": "python", "package_manager": "uv", "project_type": "api" },
  "commands": {
    "build": "make build",
    "test": "make test",
    "lint": "make lint",
    "format": "make format",
    "run": "make run"
  },
  "format_on_edit": { "*.py": "uv run ruff format {file}" },
  "protected_paths": ["migrations/**", "src/gen/**", "infra/**"],
  "test_globs": ["tests/**", "**/*_test.py"],
  "secret_patterns_extra": [],
  "risk": {
    "high_risk_paths": ["src/auth/**", "infra/**"],
    "always_human_paths": [".github/workflows/**", ".sdlc/**", "REVIEW.md"],
    "profile": "strict",
    "tiers": { "low": { "approvals": 0 }, "medium": { "approvals": 1 }, "high": { "approvals": 2 } },
    "trusted_authors": ["@ana", "juan@example.com"],
    "size": { "low_max_lines": 50, "high_min_lines": 800 },
    "agent_escalation": false
  },
  "production_gate": { "patterns": ["deploy.*prod", "terraform apply"], "approval_env": "RELEASE_APPROVAL" },
  "gates": { "intent": ["po"], "spec": ["po", "policy-owners"], "plan": ["tech-lead"] },
  "roles": { "po": ["ana@miempresa.com"], "tech-lead": ["juan@miempresa.com"] },
  "plugin": { "marketplace_repo": "https://github.com/martinisef/ai_sdlc.git" },
  "ci": { "agent": "claude", "min_pass_rate": 0.8 }
}
```

| Clave | Quién la usa | Notas |
|---|---|---|
| `locale` | mensajes de guardrails, dashboard | `en` o `es`. |
| `agents` | `sdlc sync`, `sdlc doctor` | Qué adapters generar: `claude`, `cursor`, `agents-md` (Codex, Copilot y otros que leen AGENTS.md). |
| `vcs.*` | `sdlc vcs`, `/sdlc-ship`, CI | Si falta `provider`, se deduce del remote. |
| `tracker.*` | `sdlc tracker`, skills del loop, CI | `provider`: `jira`, `github` (GitHub Issues; `repo` si no es el repositorio del código), `linear` (`team_key`) o `none`. `transitions` mapea cada etapa a una transición o estado destino de Jira, un label de GitHub (por defecto `sdlc:<etapa>`; `merged` cierra el issue) o un estado del workflow de Linear. `epic_issue_type` (Jira, por defecto `Epic`) es el tipo que usa `sdlc roadmap apply` para las épicas; las historias usan `default_issue_type`. `epic_link_field` (Jira Data Center/Server, ej. `customfield_10014`) vincula las historias a su épica donde Cloud usa `parent`. |
| `discovery.*` | `sdlc discovery`, `/sdlc-discovery`, dashboard | *Experimental.* `dir` (por defecto `changes/_discovery`), `base_branch` (dónde busca el agente el código existente; por defecto `vcs.default_branch`), `team` (los nombres de tu lado; por defecto todos los de `roles`), `followup_locale` (`en`/`es`; por defecto `locale`), `commit_transcripts` (por defecto `true`; `false` deja las transcripciones fuera de git, solo se commitean su hash y su nombre). |
| `commands.*` | skills, `verifier`, evals | Cada uno es un solo comando que sale ≠ 0 si falla. |
| `format_on_edit` | hook PostToolUse | Glob → comando; `{file}` se reemplaza por la ruta. Mantenerlo rápido (un archivo). |
| `protected_paths` | hook `protect-paths` | `*` cruza `/`; `**/` inicial es opcional. |
| `append_only_paths` | hook `protect-paths`, pre-commit | Mismos globs; se pueden crear archivos nuevos pero no cambiar los existentes (por ejemplo, migraciones aplicadas: `db/migrate/**`). |
| `test_globs` | hook `test-lock` | Archivos que no se pueden editar durante `/sdlc-fix`. |
| `secret_patterns_extra` | hook `secrets-guard` | Regex ERE adicionales (ej. formato de IDs internos sensibles). |
| `risk.high_risk_paths` | `sdlc risk`, `/sdlc-spec`, `/sdlc-plan`, REVIEW.md | Un cambio que las toca (o cuya spec/plan las nombra) es de riesgo **high**; un plan high también necesita tech lead. |
| `risk.always_human_paths` | `sdlc risk` | Nunca son de riesgo low (como mínimo **medium**). Por defecto: workflows de CI (`.github/workflows/**`, `.gitlab-ci.yml`, `ci/*.gitlab-ci.yml`, `bitbucket-pipelines.yml`), `.sdlc/**` y `REVIEW.md`. Definir la clave reemplaza la lista. |
| `risk.profile` | gates, `sdlc ci gate-status` | `strict` (por defecto): cada gate necesita una persona, como hasta ahora. `graded`: las aprobaciones humanas escalan con el nivel (`risk.tiers`). Arrancá estricto y aflojá con datos (`sdlc metrics`). |
| `risk.tiers` | gates | Aprobaciones humanas por nivel. Por defecto en `graded`: low 0, medium 1, high 2. El intent siempre lo aprueba una persona. |
| `risk.trusted_authors` | gates | Quién tiene los caminos livianos (nombre de git, email o `@login`). Sin definir: todos los de `roles` (o cualquiera, si no hay roles). El resto siempre necesita otra persona. |
| `risk.size` | `sdlc risk` | `low_max_lines` (por defecto 50) y `high_min_lines` (por defecto 800) de líneas de código ponderadas: las modificadas y borradas cuentan completas, las de archivos nuevos cuentan la mitad; docs y `test_globs` no cuentan. |
| `risk.agent_escalation` | `sdlc ci risk` | `true`: un segundo clasificador, un agente, lee el diff y puede subir el nivel (nunca bajarlo). |
| `production_gate` | hook `production-gate` | Regex ERE sobre comandos Bash; sin la variable de aprobación → bloqueo. |
| `gates` | `sdlc approve`, `sdlc roadmap approve`, dashboard | Roles que pueden aprobar cada artefacto, y `roadmap` para los roadmaps. Sin roles: cualquier persona (nunca un agente o bot). `risk: high` suma `tech-lead` al plan. |
| `gates_self_approval` | `sdlc approve` | `true` (preset `solo`): el autor puede aprobar su propia spec y plan. Los agentes y bots siguen sin poder. |
| `roles` | `sdlc approve`, dashboard | Rol → emails/nombres git, o `@login` en la forja (comentarios en el PR). |
| `quick_lane` | `sdlc quick`, hook pre-push | `enabled` (por defecto `true`), `max_files` (archivos de código, por defecto 10), `forbid_paths` (globs, se suman a `risk.high_risk_paths`). Si se superan, el push se bloquea hasta `sdlc promote`. |
| `notify` | `sdlc notify`, `sdlc ci` | Eventos del loop a Slack o a un webhook. `webhook_env` (por defecto `SDLC_NOTIFY_WEBHOOK`; sin valor → apagado), `format` `slack`\|`generic`, `events` (por defecto todos: `gate.pending`, `gate.decided`, `spec.ready`, `review.done`, `change.merged`, `risk.raised`), `people` (`@login`/email/nombre → member ID de Slack, para mencionar). Fail-open. |
| `plugin.marketplace_repo` | `sdlc ci bootstrap` | De dónde clonar el plugin de Claude en CI. Sin esto, el CI usa las skills commiteadas por `sdlc sync`. |
| `ci.agent` | `sdlc ci`, `sdlc bands check` | Agente headless en CI: `claude` (default), `codex` (`codex exec`) o `cursor` (`cursor-agent`). Lo pisan `--agent` o `SDLC_CI_AGENT`. |
| `ci.model` | `sdlc ci` | Modelo que se le pasa a la CLI del agente. |
| `ci.min_pass_rate` | `sdlc ci evals` | Tasa mínima de evals aprobados (default 0.8; `EVAL_MIN_PASS_RATE` la pisa). |
| `ci.pr_sections` | `sdlc ci gate-status`, `/sdlc-ship` | Títulos que necesita toda descripción de PR/MR antes de que `sdlc/gates` quede en verde. Por defecto `["Testing", "Risk", "How to revert"]` (valen también Pruebas, Riesgo, Cómo revertir); Riesgo declara al menos el nivel calculado. `[]` apaga el control. |
| `ci.review.depth` | `sdlc ci review` | `auto` (por defecto: low Quick, medium Standard, high Deep), o fija: `quick`, `standard`, `deep`. |
| `ci.review.max_rounds` | `sdlc ci review` | Rondas de review por PR (por defecto 3). Después del tope el reviewer solo revisa si los findings abiertos se arreglaron. |
| `ci.nightly.modules` | `sdlc ci nightly-review` | Carpetas que recorre el review nocturno, una por noche (por defecto: cada carpeta de código de primer nivel, y cada hija de `src/`, `packages/`, `lib/`…). |
| `ci.nightly.max_intents` | `sdlc ci nightly-review` | Intents que puede abrir una noche para hallazgos Important (por defecto 3). |
| `ci.mention_mode` | `sdlc ci mention` | `read` (default): el agente solo responde los comentarios con `@claude`. `edit`: además puede commitear cambios dentro del plan aprobado en la rama del PR/MR. |
