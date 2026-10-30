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
    "provider": "jira | none",
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
  "risk": { "high_risk_paths": ["src/auth/**", "infra/**"] },
  "production_gate": { "patterns": ["deploy.*prod", "terraform apply"], "approval_env": "RELEASE_APPROVAL" },
  "gates": { "intent": ["po"], "spec": ["po", "policy-owners"], "plan": ["tech-lead"] },
  "roles": { "po": ["ana@miempresa.com"], "tech-lead": ["juan@miempresa.com"] },
  "plugin": { "marketplace_repo": "https://github.com/<org>/ai-native-sdlc.git" },
  "ci": { "agent": "claude", "min_pass_rate": 0.8 }
}
```

| Clave | Quién la usa | Notas |
|---|---|---|
| `locale` | mensajes de guardrails, dashboard | `en` o `es`. |
| `agents` | `sdlc sync`, `sdlc doctor` | Qué adapters generar: `claude`, `cursor`, `agents-md` (Codex, Copilot y otros que leen AGENTS.md). |
| `vcs.*` | `sdlc vcs`, `/sdlc-ship`, CI | Si falta `provider`, se deduce del remote. |
| `tracker.*` | `sdlc tracker`, skills del loop, CI | `transitions` acepta nombre de transición **o** nombre del estado destino. |
| `commands.*` | skills, `verifier`, evals | Cada uno es un solo comando que sale ≠ 0 si falla. |
| `format_on_edit` | hook PostToolUse | Glob → comando; `{file}` se reemplaza por la ruta. Mantenerlo rápido (un archivo). |
| `protected_paths` | hook `protect-paths` | `*` cruza `/`; `**/` inicial es opcional. |
| `test_globs` | hook `test-lock` | Archivos que no se pueden editar durante `/sdlc-fix`. |
| `secret_patterns_extra` | hook `secrets-guard` | Regex ERE adicionales (ej. formato de IDs internos sensibles). |
| `risk.high_risk_paths` | `/sdlc-spec`, `/sdlc-plan`, REVIEW.md | Marca `risk: high` → requiere tech lead. |
| `production_gate` | hook `production-gate` | Regex ERE sobre comandos Bash; sin la variable de aprobación → bloqueo. |
| `gates` | `sdlc approve`, dashboard | Roles que pueden aprobar cada artefacto. Sin roles: cualquier persona (nunca un agente o bot). `risk: high` suma `tech-lead` al plan. |
| `roles` | `sdlc approve`, dashboard | Rol → emails/nombres git. |
| `plugin.marketplace_repo` | `sdlc ci bootstrap` | De dónde clonar el plugin de Claude en CI. Sin esto, el CI usa las skills commiteadas por `sdlc sync`. |
| `ci.agent` | `sdlc ci`, `sdlc bands check` | Agente headless en CI: `claude` (default), `codex` (`codex exec`) o `cursor` (`cursor-agent`). Lo pisan `--agent` o `SDLC_CI_AGENT`. |
| `ci.model` | `sdlc ci` | Modelo que se le pasa a la CLI del agente. |
| `ci.min_pass_rate` | `sdlc ci evals` | Tasa mínima de evals aprobados (default 0.8; `EVAL_MIN_PASS_RATE` la pisa). |
| `ci.mention_mode` | `sdlc ci mention` | `read` (default): el agente solo responde los comentarios con `@claude`. `edit`: además puede commitear cambios dentro del plan aprobado en la rama del PR/MR. |
