<!--@include: ../../content/en/skills/sdlc-setup/reference/sdlc.schema.md-->

## Editing it

- **Dashboard**: `sdlc ui` → Settings. The form is validated against the schema.
- **By hand**: edit `.sdlc/config.json`, then run `sdlc sync` to regenerate the agent files and `sdlc doctor` to check them.
- **Editor completion**: `sdlc schema > .sdlc/config.schema.json`, then add `"$schema": "./config.schema.json"`.

Files that `sync` generates are tracked in `.sdlc/generated.json`. If you edit one by hand, `sync` keeps your version and reports it as `drift`. `sync --force` regenerates it.
