# Upgrading from 0.x

1.0 makes no breaking changes to commands, config or artifacts: a project set up with 0.7 keeps working. What 1.0 adds is the [stability contract](../reference/stability.md), the promise that none of that breaks again until 2.0.

## Steps

```bash
npm i -D @morsadev/sdlc@1
npx sdlc sync          # regenerate the skills, agent files and git hooks
npx sdlc doctor --fix  # moves a legacy .claude/sdlc.json, repairs hooks
git add -A && git commit -m "chore: sdlc 1.0"
```

Using the Claude Code plugin? Run `/plugin marketplace update ai-native-sdlc`. The editor extension is the `.vsix` on the [release](https://github.com/martinisef/ai_sdlc/releases).

## What behaves differently

| Before | In 1.0 |
|---|---|
| Dashboard agent jobs (roadmaps) used Claude Code unless `ci.agent` said otherwise | They use `ci.agent` or `SDLC_CI_AGENT` if set, otherwise the first of your `agents` whose CLI is installed. The Roadmaps page shows which. A Cursor-only project now runs `cursor-agent` without any setting. |
| Raw HTML in artifacts was rendered in the dashboard | It is shown as text, and links other than http(s), mailto and relative ones are dropped. Artifacts can come from anyone's pull request. |
| `sdlc hosted` listened on every interface | Without `SDLC_HOSTED_TOKEN` it listens on 127.0.0.1 only; set `HOST=0.0.0.0` behind your SSO proxy. |
| `sdlc status --metrics` | Still works, with a deprecation warning; use `sdlc metrics`. It goes in 2.0. |
| A roadmap's PDF source was only copied | A `source.txt` is also written next to it when `pdftotext` is installed, for agents that cannot read PDFs. |

## Deprecated, removed in 2.0

- `.claude/sdlc.json`: still read throughout 1.x. `sdlc doctor` warns about it, and `sdlc migrate` moves it to `.sdlc/config.json`.
- `sdlc status --metrics`: use `sdlc metrics`.

## Trying a release candidate

Before a major version, release candidates are published under the `rc` tag:

```bash
npm i -D @morsadev/sdlc@rc
```

`npm i -D @morsadev/sdlc` keeps installing the stable release.
