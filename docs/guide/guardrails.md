# Guardrails

Every guardrail lives in one place (`sdlc hook`) and is configured in `.sdlc/config.json`. Agent hooks call it *before* an action; git hooks call it at commit and push. When a guardrail blocks, the message says what the right path is. The rule for agents is: **do not work around a hook.**

| Guardrail | Config | What it does |
|---|---|---|
| `protected-paths` | `protected_paths` | Blocks edits to generated code, applied migrations, infra… `*` crosses `/`, and a leading `**/` is optional. |
| `secrets` | `secret_patterns_extra` | Blocks credentials (AWS keys, private keys, GitHub, GitLab, Slack, Anthropic, OpenAI, Google and Atlassian tokens, generic `api_key = "…"` assignments) in written content, in shell commands and, in Cursor, in files being read and in prompts. Extra patterns are EREs. |
| `test-lock` | `test_globs` | While a fix is in progress (`sdlc lock on`), test files cannot be edited: the failing test comes first, then the code. |
| `production-gate` | `production_gate.patterns`, `approval_env` | Blocks shell commands that match (for example `deploy.*prod` or `terraform apply`) unless the approval variable (default `RELEASE_APPROVAL`) is set. Mentions inside `echo` or `git commit -m` do not count. |
| `format-on-edit` | `format_on_edit` | Runs the formatter on each edited file (glob → command, with `{file}` replaced by the path). |
| `plan-sync` | — | Before the agent stops: if code changed but `plan.md` did not, the agent is asked to update the plan in the same commit. |
| `plan-first` | — | `pre-push` on `change/*` branches refuses code until `plan.md` is approved. |

## Enforcement per agent

`sdlc doctor` prints this matrix for the agents configured in your project:

| Guardrail | Claude Code | Cursor | AGENTS.md agents |
|---|---|---|---|
| protected-paths | blocks + commit | blocks + commit | commit |
| test-lock | blocks + commit | blocks + commit | commit |
| secrets | blocks + commit | blocks + commit | commit |
| production-gate | blocks | blocks | ci + advisory |
| format-on-edit | post-hoc | post-hoc | advisory |
| plan-sync | blocks | blocks | advisory |
| plan-first | advisory + push | advisory + push | advisory + push |

The values mean:

- **blocks**: stopped before it happens.
- **commit** / **push**: enforced by the git hooks (`.sdlc/git-hooks`, installed by `sdlc sync`).
- **post-hoc**: runs after the action and is reported.
- **advisory**: instructions only.

## Overrides

The git hooks can be overridden by a person, and the override is recorded:

```bash
SDLC_OVERRIDE=protected-paths git commit -m "regenerate the client"
```

Each block and each override is written to `.sdlc/events.jsonl` and shown in the dashboard under Activity. That file is local and gitignored.

## Fail open

If the CLI cannot be found, the hooks let the action through and `sdlc doctor` warns about it. The guardrails assist people and agents. The controls that must never fail belong in [managed settings](./managed-settings) and in branch protection.
