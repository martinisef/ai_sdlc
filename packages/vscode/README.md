# AI SDLC for VS Code and Cursor

The [AI-native SDLC loop](https://martinisef.github.io/ai_sdlc/) in your editor:

- **Status bar**: the active change, its stage and the one thing to do next (`sdlc next`). Click it for a menu: do the next step, open the intent, spec or plan, start a quick change, approve or reject a gate that is waiting on you, open the dashboard, or run `doctor --fix`.
- **AI SDLC sidebar**: every change grouped by stage, with **Waiting on my gate** at the top.
- **No install needed**: the extension uses `node_modules/.bin/sdlc` when the workspace has it, and otherwise the CLI it bundles. Set `aiSdlc.cliPath` to use another one.

Approving from the editor records the same commit as `sdlc approve`, with you as the approver. Agents and bots still cannot approve.

Install: download `ai-sdlc-<version>.vsix` from the [GitHub release](https://github.com/martinisef/ai_sdlc/releases), then **Extensions → ⋯ → Install from VSIX…** (VS Code and Cursor). See the [editor guide](https://martinisef.github.io/ai_sdlc/guide/editor).
