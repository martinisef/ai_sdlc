# Control bands (Stage 6)

`sdlc bands check` closes the loop from production back to intent. It reads `ops/bands.yaml` and computes the mean and σ of each metric over a rolling baseline. It then applies the four **Western Electric rules**:

| Rule | Signal | Tier |
|---|---|---|
| 1 | 1 point beyond 3σ | `3sigma` |
| 2 | 2 of 3 points beyond 2σ, on the same side | `2sigma` |
| 3 | 4 of 5 points beyond 1σ, on the same side | `1sigma` |
| 4 | 8 points in a row on one side of the mean | `1sigma` |

`direction` (`up`, `down` or `both`) says which side is bad. The most recent points are kept out of the baseline, so a shift cannot hide inside its own average.

Detection is deterministic. The agent only runs once a band breaks, and the **tier** decides how far it may go:

| Action | What happens |
|---|---|
| `log` | A `band.break` event in the activity log (dashboard → Activity). |
| `diagnose` | A read-only diagnosis by the headless agent (step 1 of `sdlc-incident`), limited to the `tools` you list. |
| `propose` | An incident intent `changes/<YYYY-MM>-incident-<metric>-<date>/intent.md` (`origin: incident`) committed on its own `change/incident-*` branch and pushed. With `routes: [pull_request]`, it also opens a draft PR. `runbook:<name>` routes are listed for a person to run. |

A metric with an open incident branch does not get a second one. When a tier is not configured, the closest lower one applies.

## Sources

| Source | Reading |
|---|---|
| `command` | Prints one number (the current reading; the history is kept in `.sdlc/bands/<metric>.jsonl`, gitignored) or one number per line (a full series). |
| `http_json` | `{ url, path, headers }`. `path` is a dotted path into the JSON response, and `${VAR}` in the URL or headers is expanded from the environment. |
| `prometheus` | `{ url, query, range, step }`, using `query_range`. |

## `ops/bands.yaml`

<<< @/../content/en/skills/sdlc-setup/scaffold/ops/bands.yaml{yaml}

## Running it

```bash
sdlc bands check --dry-run          # evaluate and print; no events, no agent, no push
sdlc bands check --json
sdlc bands check --no-agent         # log only, even for diagnose/propose tiers
sdlc bands check --agent codex
```

In CI it runs on a schedule:

- GitHub: `.github/workflows/sdlc-bands.yml`;
- GitLab: the `sdlc:bands` job, with `SDLC_JOB=bands` on a pipeline schedule;
- Bitbucket: the `control-bands` custom pipeline.

`sdlc doctor` validates `ops/bands.yaml`.

Leave the file commented out until the service has metrics with a stable baseline. A band over noise only produces noise.
