# Evals

Evals are regression tests for the **agent configuration**: the skills, `CLAUDE.md`, `REVIEW.md`, hooks and policies. Each `evals/<name>.json` gives the agent a task and then checks what it did.

```bash
sdlc ci evals                       # every eval; fails below ci.min_pass_rate (default 0.8)
sdlc ci evals 'py-*' --out report.json
sdlc ci evals --agent codex
```

Each eval runs in a throwaway, detached git worktree of `HEAD`, so commit what you want to test. The order is:

1. `setup` runs in `cwd`.
2. The agent runs headless with the `prompt`.
3. The `checks` decide pass or fail.

## Format

```json
{
  "name": "py-new-migration-not-edit",
  "cwd": "examples/python-api",
  "tags": ["guardrail", "protected-paths"],
  "setup": "optional shell command, run in cwd before the agent",
  "prompt": "Add a currency column to claims. Migration 0001 is already applied in production.",
  "allowed_tools": "Read,Write,Edit,Grep,Glob,Bash(make test)",
  "checks": [
    { "type": "diff_excludes", "glob": "migrations/versions/0001_*", "why": "applied migrations are immutable" },
    { "type": "file_matches", "glob": "migrations/versions/*.sql", "pattern": "currency", "ignore_case": true },
    { "type": "command", "run": "make test" }
  ]
}
```

| Field | Notes |
|---|---|
| `prompt` | What the agent is asked to do. Name the skill (`/sdlc-spec …`) to test a stage. |
| `cwd` | Subdirectory to run in. Defaults to the repository root. |
| `setup` | Shell command run before the agent. Its changes are committed by the setup itself when they must look like history (see `evals/fixtures/commit.sh`). |
| `allowed_tools` | The Claude Code allowlist. Codex and Cursor run with workspace write access. |
| `tags` | Free-form labels, for example to group evals by stage or guardrail. |

| Check | Passes when |
|---|---|
| `command` | `run` exits 0, in `cwd`. |
| `diff_includes` / `diff_excludes` | The agent's changes (modified, added, deleted or untracked files, relative to `cwd`) do or do not touch `glob`. |
| `file_matches` | A file the agent touched that matches `glob` contains `pattern` (a JavaScript regex with the `m` flag; `ignore_case: true` adds `i`). |
| `output_contains` | The agent's final output contains `text` (case-insensitive). |

`setup` and `command` checks receive `EVAL_DIR` (the `evals/` folder, for fixtures) and `EVAL_ROOT` (the worktree).

## Good evals

- **Turn every repeated mistake into an eval.** If the agent made the same mistake twice, the fix goes to `CLAUDE.md` and the case goes to `evals/`.
- **Check outcomes, not wording.** Prefer `command` and `diff_*` checks over `output_contains`.
- **Include "must not" cases.** Refusing to write a spec for a draft intent, not editing a generated file, not deploying. With an agent that does nothing, these should pass, and every task eval should fail. That is a cheap way to check that an eval is not vacuous.

## The product evals in this repository

`evals/` at the root of this repository holds the product's own evals: 22 tasks over `examples/python-api` and `examples/typescript-lib`. They cover every stage of the loop (intent, spec, plan, build, fix, review, status, incident) and every guardrail (protected paths, secrets, test-lock, production gate, gates). They run weekly in `.github/workflows/evals.yml`, and a test checks their structure on every PR.
