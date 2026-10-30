# <Project name>
<!-- One page max. If Claude makes the same mistake twice, the fix goes here. -->

## Commands
<!-- /sdlc-setup fills this in with the real, verified commands -->
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
<!-- /sdlc-setup fills this in based on the stack and the team's answers -->

## Architecture
<!-- Main folders and what lives in each one -->

## Things Claude gets wrong
<!-- Filled in through use. Rule: same mistake twice → it goes here. -->
