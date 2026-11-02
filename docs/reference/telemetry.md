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
