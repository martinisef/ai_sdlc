# Editor extension (VS Code and Cursor)

The AI SDLC extension puts the loop where you already are: the next step in the status bar, the gates waiting on you, and every change by stage in a sidebar. It calls the same `sdlc` CLI as the terminal, the hooks and CI, so it never disagrees with them.

## Install

The extension ships as a `.vsix` file on each [GitHub release](https://github.com/martinisef/ai_sdlc/releases) (`ai-sdlc-<version>.vsix`). Marketplace and Open VSX listings come later.

- **VS Code**: Extensions view → **⋯** → **Install from VSIX…**, or `code --install-extension ai-sdlc-<version>.vsix`.
- **Cursor**: Extensions view → **⋯** → **Install from VSIX…**, or drag the file onto the Extensions view. From a terminal: `cursor --install-extension ai-sdlc-<version>.vsix`.

It activates in workspaces with `.sdlc/config.json` or a `changes/*/intent.md`.

## What it shows

**Status bar**: the active change, its stage and what comes next, from `sdlc next`. For example `export · approve spec`, `export · /sdlc-plan` or `export · waiting on @priya`. A number after the inbox icon counts other gates waiting on you. Click it for the menu:

| Item | Does |
|---|---|
| The next step | Runs the command in a terminal, or copies the skill (`/sdlc-plan`) for you to paste in your agent's chat. |
| Approve / Reject the *artifact* of *change* | Only for gates you can decide (the same rules as `sdlc approve`: roles, no self-approval, never an agent). Approving asks for confirmation; rejecting asks for the reason. |
| Open intent.md / spec.md / plan.md | The artifacts of the active change. |
| Quick change… | `sdlc quick "<what>"` in a terminal. |
| Open the dashboard | `sdlc ui`. |
| Doctor --fix | `sdlc doctor --fix`; the report goes to the **AI SDLC** output. |

**AI SDLC sidebar** (the loop icon in the activity bar): **Waiting on my gate** first, then the changes in Intent, Spec, Plan, Build, Merged and Rejected. Clicking a change opens the artifact of its stage; right-click a gate to approve or reject it.

The view refreshes when `changes/**`, `.git/HEAD` (switching branches) or `.sdlc/config.json` change.

## Which CLI it runs

1. `aiSdlc.cliPath`, if you set it.
2. `node_modules/.bin/sdlc` in the workspace, when the project installs `@morsadev/sdlc`.
3. Otherwise the CLI bundled in the extension, run by the editor's own runtime (`ELECTRON_RUN_AS_NODE=1`): nothing to install, not even Node.

The **AI SDLC** output channel says which one is in use and logs any command that fails.

## Build it from source

```bash
npm run build:ui && npm run build:cli
npm run package:vscode        # packages/vscode/ai-sdlc-<version>.vsix
xvfb-run -a node packages/vscode/smoke/run.mjs   # smoke test in a real VS Code (drop xvfb-run on macOS)
```
