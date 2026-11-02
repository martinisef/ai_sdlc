---
'@morsadev/sdlc': minor
---

Editor extension for VS Code and Cursor (`ai-sdlc-<version>.vsix` on each GitHub release): the next step in the status bar, a sidebar of changes by stage with "Waiting on my gate", and commands to approve or reject, open artifacts, start a quick change, open the dashboard and run `doctor --fix`. It bundles the CLI, so nothing has to be installed. `sdlc status --json` now includes `slug` and `title`, and prints nothing when there are no changes.
