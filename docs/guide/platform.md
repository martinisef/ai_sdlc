# Platform guide

How a platform team publishes, distributes and maintains the loop for an organization.

## 1. Distribution channels

| Channel | For | How |
|---|---|---|
| npm: `@ai-native-sdlc/cli` | every agent, CI | `npm i -D @ai-native-sdlc/cli`. CI templates run `npx -y @ai-native-sdlc/cli@0 ci <cmd>`. |
| Claude Code marketplace: the `ai-sdlc` plugin | Claude Code users | the skills, subagents and hooks, plus a bundled CLI in the plugin's `bin/` |
| Project files (`sdlc sync`) | every agent | skills and hooks committed into each repo; no plugin needed |

## 2. Publish your own marketplace (optional)

To ship a customized catalog (your own policies, stacks and templates), fork this repository.

1. Replace `martinisef/ai_sdlc` with your repository in:
   - `content/*/skills/sdlc-setup/reference/defaults.json` (the defaults `/sdlc-setup` writes);
   - `managed-settings/example.json` (`strictKnownMarketplaces`).
2. Build and validate:
   ```bash
   npm ci && npm run build          # regenerates plugins/ai-sdlc and .claude-plugin/marketplace.json
   npm run check:plugin             # claude plugin validate for the plugin and the marketplace
   ```
3. Commit `plugins/ai-sdlc`. It is generated, and CI fails when it is out of date.
4. Set `plugin.marketplace_repo` in each project's `.sdlc/config.json`. `sdlc sync` then enables the plugin in `.claude/settings.json` instead of copying the skills.

Releases use [changesets](https://github.com/changesets/changesets):

1. Run `npx changeset` in each PR that changes behavior.
2. On `main`, the release workflow opens a "Version packages" PR. That PR bumps `@ai-native-sdlc/cli` and regenerates the plugin and `marketplace.json` with the same version.
3. Merging it publishes to npm with provenance.

The CLI is the only published package. The other workspaces are bundled into it.

## 3. Installation

- **Per person**: `/plugin marketplace add <org>/ai-native-sdlc`, then `/plugin install ai-sdlc@ai-native-sdlc`.
- **Per project**: `.claude/settings.json` with `extraKnownMarketplaces` and `enabledPlugins`, written by `sdlc sync` when `plugin.marketplace_repo` is set. Claude Code offers to install the plugin when the repo is opened.
- **Try changes without installing**: `claude --plugin-dir ./plugins/ai-sdlc`. If you use `-p`, pass the prompt on stdin, because `--plugin-dir` takes several values.

## 4. Managed settings

See [Managed settings](./managed-settings). Deploy them with the admin console or MDM.

## 5. Maintain the catalog

| What | Where | Owner |
|---|---|---|
| Decisions per stack | `content/<locale>/skills/sdlc-setup/stacks/<lang>.md` | platform |
| CI per provider | `content/<locale>/skills/sdlc-setup/ci/` | platform |
| Policies as skills | `content/<locale>/skills/policy-<name>/SKILL.md` (one folder per policy) | the owner of each policy approves the PR |
| Artifact templates | `content/<locale>/skills/sdlc-setup/scaffold/changes/_templates/` | platform + product |
| Guardrails | `packages/core/src/policies.ts`, `sdlc hook` | platform |

`content/en` is the source; `content/es` mirrors it. Keep both in sync in the same PR.

**A new policy.** Copy `policy-secure-api/` and write it from the owner's source of truth. Its description must say **when** to apply it, because that is what makes it activate. If the policy must always hold, add a deterministic control as well: a hook, a test, or a pass in `REVIEW.md`.

**A new stack.** When a team uses `_unknown.md`, their `SETUP.md` includes a draft of `stacks/<lang>.md`. Review it and add it.

## 6. Quality of this repository

```bash
npm test                    # core, adapters, CLI (vcs, tracker, ci, bands), product-eval structure
npm run test:bash           # guardrail parity (Claude Code payloads)
npm run e2e                 # lifecycle + hooks + git hooks on a copy of examples/python-api; live claude -p when available
npm run check:pack          # npm pack + install + init + doctor in a scratch project
```

The product evals in `evals/` run weekly (`.github/workflows/evals.yml`). They give the agent real tasks on `examples/` and check the result. See [Evals](../reference/evals).
