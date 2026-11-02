---
"@morsadev/sdlc": patch
---

Gate skills (`/sdlc-spec`, `/sdlc-plan`, `/sdlc-build`) state that only `status` counts: an `approved_by` value never turns a draft into an approved artifact. Found by the live eval `py-spec-refuses-draft-intent`.
