# Telemetry and the adoption funnel

## Funnel (local)

`sdlc metrics --funnel [--json]` shows how far changes get through the loop. It reads git, so everyone on the team sees the same numbers:

```text
Full loop (12 changes, 1 rejected)
  started            12  ████████████████████ 100%
  intent-accepted    10  █████████████████    83%
  spec-approved       8  █████████████        67%
  plan-approved       7  ████████████         58%
  building            6  ██████████           50%
  merged              5  ████████             42%
Quick lane: 9 started, 7 merged, 1 promoted to the full loop
From sdlc init (this machine): first change 6 min · first quick change - · first gate decision 25 min
```

A change counts for every step it reached. Quick-lane changes are counted apart; a promoted change (`lane: full`) counts in both. The "from `sdlc init`" line reads the local activity log (`.sdlc/events.jsonl`, not committed), so it only covers what happened on this machine.

## Human time and guardrails

`sdlc metrics` (and the dashboard's Metrics view) measures what review costs people, next to the signals that say whether spending less of it is safe. Everything comes from git except review rounds and comments, which only the forge knows.

| Metric | Source |
|---|---|
| Human approvals per change | Gate commits (`Gate: … by <person>`) on intent, spec and plan; automatic approvals (`by sdlc (risk low)`) do not count. Squash and merge commits that repeat the trailer are not counted twice. |
| Waiting for a person | Hours from the last edit of an artifact to its first human decision, summed per change. |
| Review rounds | The round recorded by `sdlc ci review` and `sdlc ci security` in their summary comment. |
| Human comments | Comments on the PR by people: not agents or bots, and not the loop's own comments. |
| Revert rate | Commits on the default branch (first parent) whose subject starts with `Revert "` or whose body says `This reverts commit`, per other commit. |
| Incidents per change | Changes with `origin: incident` per other change. |
| Review comment outcomes | Each automated review finding as fixed, wrong, intentional, ignored or open, from the review state and the `resolved:` replies ([details](./agent-scorecard.md)). `--value review_wrong_rate` is the share that was wrong. |

The summary shows the median and p95 of each human-time metric. `--since 30d` limits the guardrails and the per-change spreads to recent changes.

Review rounds and comments are read from `.sdlc/pr-stats.json`, which `sdlc metrics --prs` refreshes with `gh` or `glab`. Run it on a schedule or before a retro; without it those two columns stay empty.

Pair them with a [control band](./bands.md#circuit-breaker): when reverts or incidents leave their band, the circuit breaker raises the minimum risk tier for a while.

## Telemetry (opt-in)

Telemetry is **off** by default and nothing leaves your machine until you turn it on:

```bash
sdlc telemetry status              # off, on, blocked by DO_NOT_TRACK, or no endpoint
sdlc telemetry status --payload    # print exactly what would be sent
sdlc telemetry on                  # or off
```

It sends only when all of these hold:

1. You ran `sdlc telemetry on`. The setting lives in `~/.config/sdlc/telemetry.json` (or `$XDG_CONFIG_HOME/sdlc/`), per person, not per repo.
2. `SDLC_TELEMETRY_URL` is set. There is no built-in endpoint: your organization decides where the data goes.
3. `DO_NOT_TRACK` is not set (any value other than `0` or `false` disables it).
4. Nothing was sent in the last 24 hours.

It is sent after interactive commands (`init`, `next`, `status`, `metrics`, `new`, `quick`, `promote`, `approve`, `reject`, `doctor`, `sync`), never from hooks or CI subcommands, with a 1.5-second timeout. Failures are ignored.

### What is sent

| Field | Example | Notes |
|---|---|---|
| `schema` | `1` | Payload version. |
| `id` | `5f0c…` | Random UUID created on first use. Not derived from you or the machine. |
| `version`, `os`, `node`, `ci` | `0.5.0`, `darwin`, `22.18.0`, `false` | |
| `agents`, `locale`, `tracker`, `vcs` | `["claude"]`, `en`, `none`, `github` | Values from `.sdlc/config.json`, without URLs or keys. |
| `funnel` | the `--funnel` numbers | Counts and minutes only. |
| `events` | `{"gate.approve": 2}` | Activity-log event counts in the last 24 hours, by type. |

Never sent: names, emails, git identities, paths, repository, branch or change names, file contents, commands, ticket keys.
