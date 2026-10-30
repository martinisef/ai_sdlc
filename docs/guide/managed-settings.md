# Managed settings (layer 1: the non-negotiable)

Platform or IT deploy them through the Claude admin console or MDM. Engineers cannot edit or override them.

[`managed-settings/example.json`](https://github.com/martinisef/ai_sdlc/blob/main/managed-settings/example.json) is a **starting point to adapt, not to copy**. Each `deny` removes capability, and the right balance depends on how the repository's data is classified.

## What each block buys

| Key | Control |
|---|---|
| `permissions.deny` | Keeps secrets out of the agent's context and blocks network egress through tools. |
| `permissions.allow` | Pre-approves the safe inner loop, so the deny list does not turn into prompt fatigue. |
| `disableBypassPermissionsMode` | Nobody can skip the rules with a flag. You can add `allowManagedPermissionRulesOnly: true` so that no project file can widen permissions. Note that this overrides the per-stack `permissions.allow` that `/sdlc-setup` generates; if you use it, move those allow rules here. |
| `sandbox` | Covers what permissions cannot. A WebFetch deny does not stop a shell command from reaching the network; an OS-level domain allowlist does. `failIfUnavailable` together with `allowUnsandboxedCommands: false` turns the sandbox into a gate. To deny reading credentials from sandboxed shell commands too, add the playbook's `sandbox.credentials` block. |
| `allowManagedHooksOnly` | Set to `false` in the example **on purpose**: the `ai-sdlc` guardrails are plugin or project hooks. If you set it to `true`, distribute those hooks through managed settings as well. |
| `strictKnownMarketplaces` | Every skill, agent, hook and MCP server comes from the organization's approved marketplace. In a fork, point it at your own repository. |
| `allowManagedMcpServersOnly` | Set to `true` to make the tool surface a platform allowlist; then declare the MCP servers you need (for example Atlassian) here. |
| `requiredMinimumVersion` | Claude Code will not start below the version the organization has evaluated. |

Reference for every key, including the managed-only ones: [code.claude.com/docs/en/settings](https://code.claude.com/docs/en/settings). Check each key against it before deploying, because some depend on the Claude Code version.

## How they interact with `ai-sdlc`

- The guardrail hooks (protected paths, secrets, test-lock, production gate) work with `allowManagedHooksOnly: false`.
- The production gate in `ai-sdlc` is a *project* control. If production is critical, replicate the hook in managed settings so that it does not depend on the project configuration or on the plugin being enabled.
- Cursor and AGENTS.md agents have their own admin controls. In every case, the `sdlc` git hooks and CI are the shared backstop.
