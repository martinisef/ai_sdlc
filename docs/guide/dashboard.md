# Dashboard

```bash
npx sdlc ui                 # http://127.0.0.1:4319, opens the browser
npx sdlc ui --port 5000 --no-open
```

A local web app over the same core as the CLI. Nothing leaves your machine.

| View | What |
|---|---|
| **Inbox** | Artifacts whose pending gate your git identity may decide, based on `gates` and `roles`, and roadmaps ready for approval. |
| **Roadmaps** | Upload a technical plan; the agent drafts the epics and stories in the background (Claude Code, Codex or the Cursor CLI, per `ci.agent`), you answer its questions, approve, preview the tickets and create them. Agent runs are kept in `.sdlc/jobs/`. See [From a technical plan to tickets](../start/roadmap.md). |
| **Board** | Every change, by column: intent, spec, plan, build, review (open PR), merged, rejected. It reads both the working tree and the `change/*` branches. |
| **Change** | The intent, spec and plan rendered side by side, the gate history, and approve/reject with a comment. |
| **Metrics** | Lead times, spec rework, human time per change, revert and incident rates, and the circuit breaker when it is on. See [The loop](./concepts.md#metrics). |
| **Activity** | Guardrail blocks and overrides, gate decisions and band breaks, from `.sdlc/events.jsonl`. |
| **Health** | `sdlc doctor` and the enforcement matrix, with a button to run `sync`. |
| **Settings** | A form over `.sdlc/config.json`, validated against the schema. |

Decisions taken in the dashboard are the same commits `sdlc approve` makes, with your git identity.

Security: the server binds to `127.0.0.1` only. Every API call needs a per-run token injected into the page, and requests whose `Host` is not local are refused, which guards against DNS rebinding.
