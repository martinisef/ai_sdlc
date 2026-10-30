---
name: sdlc-setup
description: Walkthrough that gets a project ready to work in the AI-native loop. Detects or asks for the stack, provider (GitHub/GitLab/Bitbucket) and tracker (Jira), copies the fixed structure, generates the project-specific configuration (sdlc.json, Makefile, CLAUDE.md, REVIEW.md, CI, permissions), verifies it and records progress in SETUP.md. It is re-runnable and resumes whatever is pending. Use when creating a new project, when asked to "set up the loop/SDLC", or when SETUP.md has pending steps.
argument-hint: "[--resume | --only <ci|tracker|policies|claude-md>]"
---

# /sdlc-setup — project ready for the loop

Paths (relative to this skill's base directory):
- `scaffold/` → **fixed** part that is copied into the project.
- `stacks/<language>.md` → the org's decisions per stack (tools, commands, permissions, CI).
- `ci/<provider>.md` + `ci/<provider>/` → CI templates per provider.
- `trackers/<tracker>.md` → tracker integration.
- `reference/sdlc.schema.md` → contract for `.sdlc/config.json`. `reference/defaults.json` → org values (marketplace, etc.).
- Loop CLI: `sdlc` (if `sdlc` is not on the PATH: `node <this skill's base directory>/../../bin/sdlc.mjs`). `sdlc init` does the deterministic part (detect, config, scaffold, agent adapters); this skill completes it with what requires judgment.

Principle: **what is fixed gets copied, what is specific gets generated, and nothing is marked done without verifying it.**

## 0. Resume
If `SETUP.md` exists, read it and continue from the ⬜ items (unless asked to redo something). If `.sdlc/config.json` exists, use it as defaults. If only `.claude/sdlc.json` exists (older project), run `sdlc migrate`.

## 1. Detect (without asking yet)
- Manifests: `pyproject.toml`/`requirements*.txt` → python · `package.json`/`tsconfig.json` → typescript · `pom.xml`/`build.gradle*` → java · `go.mod` → go · others → unknown.
- `git remote get-url origin`: github.com → github · gitlab → gitlab (note the host if self-hosted) · bitbucket.org → bitbucket (note workspace/repo). No remote → ask.
- Existing CI (`.github/workflows`, `.gitlab-ci.yml`, `bitbucket-pipelines.yml`), `CLAUDE.md`, `Makefile`, `.mcp.json`.
- Local dependencies: Node ≥ 22 and `gh`/`glab` depending on the provider. If something is missing, say how to install it; do not install it without permission.
- If there is no `.git`: `git init -b main` (ask first).

## 2. Ask (AskUserQuestion, with what was detected as the recommended option)
Group into 2-3 rounds, no more than 4 questions per round:
1. **Stack**: language/framework, package manager (defaults from `stacks/<lang>.md`), project type (API / frontend / library / data / CLI).
2. **Provider**: GitHub / GitLab (host, tier: Free/Premium/Ultimate) / Bitbucket Cloud (workspace). Default branch.
3. **Sensitive paths**: are there migrations, generated code, IaC, frozen packages? → `protected_paths`. What is high risk (auth, payments, infra)? → `risk.high_risk_paths`. How is production deployed? → `production_gate.patterns`.
4. **Tracker**: Jira or none. If Jira, follow `trackers/jira.md` (URL, project key, mode, transition mapping).
5. **Policies**: which of the org's policy skills apply (list the ones available in the plugin).
6. **Agents**: which agents the team uses (Claude Code, Cursor, Codex or others with AGENTS.md) → `agents` in the config.

## 3. Copy what is fixed
Copy `scaffold/` into the project **without overwriting existing files**. If a file already exists (`CLAUDE.md`, `REVIEW.md`), show which sections are missing and propose adding them (merge), not replacing.
Add to `.gitignore`: `.claude/settings.local.json` (`.sdlc/.gitignore` already excludes local state: `events.jsonl`, `fix-lock`).
Nothing to make executable: evals and CI run through `sdlc ci` (`npx -y @morsadev/sdlc@0 ci …` in the pipelines).

## 4. Generate what is specific
Follow `stacks/<lang>.md` (if it does not exist, `stacks/_unknown.md`) and `ci/<provider>.md`:
1. **`.sdlc/config.json`** according to `reference/sdlc.schema.md` (if it does not exist, `sdlc init --yes` generates it from what was detected). Validate it with `sdlc doctor`.
   After editing it, `sdlc sync` regenerates each agent's files (`.cursor/`, `AGENTS.md`, git hooks).
2. **Makefile** (or the stack's equivalent) with `build`, `test`, `lint`, `format`, `run`: each one a single command that exits ≠ 0 on failure.
3. **`.claude/settings.json`**: `extraKnownMarketplaces` + `enabledPlugins` (from `reference/defaults.json`) and `permissions.allow` for the stack's inner loop (so sessions don't wait for approval on safe commands). If it exists, merge.
   If `defaults.json` still has `CHANGE-ME` (platform has not published the marketplace), **do not infer the repo** from the remote or anywhere else: leave `CHANGE-ME` in `settings.json` and in `plugin.marketplace_repo`, warn about it and record it as ⬜ in SETUP.md ("fill in the marketplace repo").
4. **CLAUDE.md**: if the project already has code, run the analysis equivalent to `/init` and trim it. Fill in Commands (the real ones), Conventions (from the stack + answers), Architecture. **Less than one page.**
5. **REVIEW.md**: fill in "What Important means here" according to the project type (e.g. API: broken contracts, auth; frontend: accessibility, visual regressions) and "Do not report" (generated code, vendored).
6. **CI**: copy the templates from `ci/<provider>/` to their location (see `ci/<provider>.md`) and fill in the `# >>> stack` blocks with the language setup from `stacks/<lang>.md`. The pipelines only decide *when*; the logic is `sdlc ci <cmd>`, the same on all three providers. If the team does not run Claude in CI, set `ci.agent` (`codex` or `cursor`) in `.sdlc/config.json`.
7. **Tracker**: `.mcp.json` with the Atlassian MCP and `tracker` block in sdlc.json (`trackers/jira.md`).
8. **Policies**: list in CLAUDE.md which policy skills apply to this repo.

## 5. Verify (mandatory)
- `make build`, `make test`, `make lint`: green. If the project is empty, create the minimum (one module and a trivial test) so the feedback loop works from day 1. Iterate until green.
- `sdlc doctor` → no errors; shows which guardrails remain deterministic for each agent.
- Hooks: simulate a block and show it, for example
  `printf '{"tool_name":"Edit","tool_input":{"file_path":"<protected path>/x"}}' | sdlc hook pre-tool --agent claude; echo $?` → 2.
- `sdlc vcs provider` → the correct provider.
- Jira: `sdlc tracker statuses` and a `get` of a test ticket; every mapped transition exists.
- CI: validate syntax (GitHub: valid YAML; GitLab: `glab ci lint` if available; Bitbucket: valid YAML).
- Evals: `sdlc ci evals` locally (it needs the agent CLI and its API key) once there are real cases in `evals/`.
- Bands (if Stage 6 applies): `sdlc bands check --dry-run` reads every source in `ops/bands.yaml` without acting.

## 6. Record
- Update `SETUP.md`: ✅ / ⬜ / ➖ per play, with notes on what was left pending and **why**.
- Add the "Pending manual configuration" section with what cannot be done from the repo (from `ci/<provider>.md`): branch protection, secrets, code owners.
- Commit: `chore(sdlc): AI-native loop setup`.

## Stack without a reference
Use `stacks/_unknown.md`: choose the ecosystem's standard tools, **warn that there is no org reference**, and leave a draft `stacks/<lang>.md` in `SETUP.md` ("Proposal for the plugin" section) so platform can add it.

## Wrap-up
Summary: what was configured, what is manual (with steps), and the next step: **`/sdlc-intent` for the first change**.
