# Versions and stability

`@morsadev/sdlc` follows [semantic versioning](https://semver.org) from 1.0.0. Within 1.x, a minor or patch release never breaks what this page lists as stable. Upgrading from 0.x? See [Upgrading](../guide/upgrading.md).

## Stable

What you can build on: scripts, CI jobs, other tools and your own skills.

| Surface | What stays the same in 1.x |
|---|---|
| CLI commands and flags | Every command and flag in `sdlc --help` that is not marked *experimental*. New commands and flags can be added; existing ones keep their meaning. |
| Exit codes | `0` success. `1` an error or a failed check (`doctor`, `quick --check`, `roadmap check`, a blocked git hook). `2` a guardrail block in an agent hook (`sdlc hook … --agent claude\|cursor`), as the agents expect. `3` the tracker is not configured (`sdlc tracker`, `sdlc roadmap apply`). |
| `--json` outputs | Existing keys keep their name and type. New keys can be added, so read them by name. `sdlc status --json` prints one object per line (JSON Lines), one line per change. |
| `.sdlc/config.json` | The schema printed by `sdlc schema` (`version: 1`). New optional fields can be added; no field changes meaning or becomes required. |
| Artifacts | The frontmatter of `intent.md`, `spec.md` and `plan.md` (`status`, `approved_by`, `approved_at`, `ticket`, `risk`, `lane`, `origin`…), the `changes/<YYYY-MM>-<slug>/` layout and the `change/<slug>` branches. |
| Roadmaps | The `changes/_roadmaps/<slug>/roadmap.md` format: `## E1 · …` epics, `### E1.S1 · …` stories, the `risk`, `depends`, `source`, `labels`, `key` and `links` fields, `- [ ]` acceptance criteria, and the open questions with `A:` answers. |
| Gate commits | The `Gate: <artifact> <status> by Name <email>` trailer. CI and `sdlc ci gate-status` read it. |
| Hooks | `sdlc hook <event> --agent claude\|cursor\|git` and the files `sdlc sync` writes for them. |
| Skills | The names `/sdlc-*` and what each one produces. Their wording improves between releases. |
| Node.js | `>=22.18`. Dropping a Node version needs a major release. |

## Experimental

Usable, but they can change in a minor release. Each one is marked *experimental* in `sdlc --help`.

| Surface | Why |
|---|---|
| `sdlc hosted` | Phase 1 of the [hosted RFC](../rfc/hosted.md); phases 2 and 3 are open. |
| `sdlc webhook` | Its setup for GitLab and Bitbucket may change with the hosted service. |
| Discovery: `sdlc discovery`, `/sdlc-discovery`, `roadmap new --from-discovery` and the `changes/_discovery/` format | New: the topic tables and their vocabulary may change as more projects use them ([From meetings to project state](../start/discovery.md)). |
| Codex and Cursor as headless agents (`ci.agent`, `SDLC_CI_AGENT`, dashboard jobs) | Claude Code is the reference; the other CLIs have coarser permission models and change often. |
| The dashboard's HTTP API (`/api/*`) | Internal to `sdlc ui`; the UI and the server ship together. |
| The telemetry payload | Off by default; the fields may change ([Telemetry](./telemetry.md)). |

## Deprecations

Something stable is deprecated for at least one minor release before it goes, and only goes in a major release:

1. The release notes say what is deprecated and what replaces it.
2. The CLI or `sdlc doctor` warns when you use it.
3. It is removed in the next major version.

Deprecated now:

| What | Instead | Removed in |
|---|---|---|
| `.claude/sdlc.json` (read throughout 1.x) | `.sdlc/config.json`: run `sdlc migrate` or `sdlc doctor --fix` | 2.0 |
| `sdlc status --metrics` | `sdlc metrics` | 2.0 |

## Release channels

| npm tag | What |
|---|---|
| `latest` | The stable release: `npm i -D @morsadev/sdlc` |
| `rc` | Release candidates before a major version: `npm i -D @morsadev/sdlc@rc` |

Every release has notes on [GitHub](https://github.com/martinisef/ai_sdlc/releases) and in the [changelog](https://github.com/martinisef/ai_sdlc/blob/main/packages/cli/CHANGELOG.md). Packages are published from CI with npm provenance.
