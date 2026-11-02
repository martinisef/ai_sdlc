---
'@morsadev/sdlc': minor
---

`sdlc metrics --funnel` shows how far changes get through the loop (and the quick lane), plus minutes from `sdlc init` to the first change and gate. Opt-in telemetry: `sdlc telemetry on|off|status [--payload]`, off by default, sends anonymous daily counts only to `SDLC_TELEMETRY_URL`, respects `DO_NOT_TRACK`. New activity events `setup.init` and `setup.fix`.
