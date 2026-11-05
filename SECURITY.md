# Security policy

## Supported versions

| Version | Security fixes |
|---|---|
| 1.x (latest minor) | yes |
| 0.x | no: upgrade to 1.x ([Upgrading](docs/guide/upgrading.md)) |

## Reporting a vulnerability

Report it privately on GitHub: **[Report a vulnerability](https://github.com/martinisef/ai_sdlc/security/advisories/new)** (the Security tab of this repository). Do not open a public issue.

Include the version (`npx sdlc --version`), what an attacker can do, and the steps or a proof of concept. You get an answer within 5 working days. Once a fix is released, the advisory is published with credit to you unless you prefer otherwise.

## What `sdlc` trusts

Knowing this helps tell a vulnerability from expected behavior:

- **The repository's configuration is trusted like its code.** `.sdlc/config.json`, `ops/bands.yaml` and the CI templates can run commands (`format_on_edit`, shell band sources) and choose the URLs that receive tracker credentials (`tracker.base_url`). Review changes to them as you review code; `protected_paths` and `CODEOWNERS` can require that.
- **Artifacts and roadmaps are not trusted.** They can come from any branch, including a contributor's pull request. The dashboard shows raw HTML in them as text and drops links that are not http(s), mailto or relative.
- **The dashboard (`sdlc ui`) is local.** It listens on 127.0.0.1, checks the `Host` header and requires a random token generated on every start. Anyone who can run code as your user on that machine can use it, as with any local tool.
- **`SDLC_OVERRIDE` is an escape hatch for people** in the git hooks, logged locally in `.sdlc/events.jsonl`. Agent hooks still apply, and CI and code review are the controls that cannot be skipped from a laptop.
- **Hooks fail open on input they cannot read**, so that a format change in an agent does not block all work. The git hooks check the same rules again on commit and push.
- **`sdlc hosted` and `sdlc webhook` are experimental** ([stability](docs/reference/stability.md)). Without `SDLC_HOSTED_TOKEN`, `sdlc hosted` listens only on 127.0.0.1. `sdlc webhook` rejects any request without the shared secret.

## Releases

Packages are published from GitHub Actions with npm provenance (`npm view @morsadev/sdlc --json` shows the attestation). A release needs a maintainer's approval on npmjs.com.
