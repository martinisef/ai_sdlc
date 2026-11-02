---
'@morsadev/sdlc': minor
---

`sdlc doctor --fix` repairs what it can, idempotently: migrates a legacy config, runs `sync`, fills missing commands from the detected stack and installs CI. What needs a person is listed as `manual` with the command to run. New doctor check `ci`: warns when no pipeline calls `sdlc`.
