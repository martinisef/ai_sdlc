---
'@morsadev/sdlc': major
---

1.0: a stability contract. The CLI commands and flags, exit codes, `--json` outputs, the config schema, the artifact and roadmap formats, the `Gate:` trailers, `sdlc hook` and the skill names do not break within 1.x; `sdlc hosted`, `sdlc webhook`, Codex and Cursor as headless agents, the dashboard API and the telemetry payload stay experimental. See [Versions and stability](https://martinisef.github.io/ai_sdlc/reference/stability) and [Upgrading from 0.x](https://martinisef.github.io/ai_sdlc/guide/upgrading). Nothing from 0.7 breaks.

- Dashboard agent jobs use `ci.agent` or `SDLC_CI_AGENT` if set, otherwise the first of the project's `agents` whose CLI is installed, so a Cursor-only project runs `cursor-agent`. The Roadmaps page shows which agent runs.
- A roadmap's PDF source also gets a `source.txt` when `pdftotext` is installed, for agents that cannot read PDFs.
- Security: the dashboard shows raw HTML in artifacts as text, drops unsafe links, and sends a Content-Security-Policy; roadmap routes reject slugs that leave `changes/_roadmaps/`; `sdlc hosted` without `SDLC_HOSTED_TOKEN` listens on 127.0.0.1 only.
- `sdlc status --metrics` is deprecated (use `sdlc metrics`) and is removed in 2.0. `--help` marks the experimental commands.
- CI also runs on macOS.
