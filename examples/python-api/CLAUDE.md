# Claims API (example)
<!-- One page max. If Claude makes the same mistake twice, the fix goes here. -->

## Commands
- Build: `make build`
- Test: `make test`
- Lint: `make lint`
- Run: `make run`

## Verify your work
- Run build, test and lint before calling a task done, and paste the output.
- If a test fails, fix the code, not the test. Never skip or delete a failing test.

## How we work (AI-native loop)
- Every change lives in `changes/<slug>/` (intent.md → spec.md → plan.md) on the `change/<slug>` branch.
- Nothing gets implemented without an approved `plan.md`. If the implementation deviates, update `plan.md` in the same commit.
- Commands: /sdlc-intent · /sdlc-spec · /sdlc-plan · /sdlc-build · /sdlc-fix · /sdlc-ship · /sdlc-status · /sdlc-incident

## Conventions
- Python 3.11+, stdlib only at runtime; dev tools via `uv` (pytest, ruff). New dependencies only via `uv add`, justified in the plan.
- Type hints on public functions. Domain errors raise `ClaimError(message, status)`; the HTTP layer turns them into JSON `{"error": ...}`.
- Money is integer cents (`amount_cents`), never floats.
- Schema changes: add a new numbered file in `migrations/versions/`; applied migrations are never edited. Once a migration is applied in production, add it to `protected_paths` in `.sdlc/config.json` (the guardrails then block edits).

## Architecture
- `src/claims/store.py`: domain — claims and the status state machine (`TRANSITIONS`). High risk: tech lead approves plans touching it.
- `src/claims/app.py`: HTTP routing table on `http.server`; no framework.
- `migrations/versions/`: production SQL schema (protected).
- `tests/`: pytest, mirrors `src/`.

## Things Claude gets wrong
<!-- Filled in through use. Rule: same mistake twice → it goes here. -->
