<!--@include: ../../content/en/skills/sdlc-setup/reference/sdlc.schema.md-->

## Editing it

- **Dashboard**: `sdlc ui` → Settings. The form is validated against the schema.
- **By hand**: edit `.sdlc/config.json`, then run `sdlc sync` to regenerate the agent files and `sdlc doctor` to check them.
- **Editor completion**: `sdlc schema > .sdlc/config.schema.json`, then add `"$schema": "./config.schema.json"`.

Files that `sync` generates are tracked in `.sdlc/generated.json`. If you edit one by hand, `sync` keeps your version and reports it as `drift`. `sync --force` regenerates it.

---

*This page is built from [`content/en/skills/sdlc-setup/reference/sdlc.schema.md`](https://github.com/martinisef/ai_sdlc/blob/main/content/en/skills/sdlc-setup/reference/sdlc.schema.md), the reference `/sdlc-setup` follows. If you are reading it on GitHub and see nothing above, open it there or read the page on the [docs site](https://martinisef.github.io/ai_sdlc/).*
