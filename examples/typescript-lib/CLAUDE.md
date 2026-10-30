# @example/money (example)
<!-- One page max. If Claude makes the same mistake twice, the fix goes here. -->

## Commands
- Build: `make build`
- Test: `make test`
- Lint: `make lint`

## Verify your work
- Run build, test and lint before calling a task done, and paste the output.
- If a test fails, fix the code, not the test. Never skip or delete a failing test.

## How we work (AI-native loop)
- Every change lives in `changes/<slug>/` (intent.md → spec.md → plan.md) on the `change/<slug>` branch.
- Nothing gets implemented without an approved `plan.md`. If the implementation deviates, update `plan.md` in the same commit.
- Commands: /sdlc-intent · /sdlc-spec · /sdlc-plan · /sdlc-build · /sdlc-fix · /sdlc-ship · /sdlc-status · /sdlc-incident

## Conventions
- TypeScript, ESM, Node ≥ 22.18 (tests run the `.ts` sources directly with `node --test`). No runtime dependencies.
- Amounts are `bigint` minor units; never convert to `number` for arithmetic.
- Errors are `MoneyError`; public functions validate their inputs.
- `src/gen/currencies.generated.ts` is generated: change `scripts/generate-currencies.ts` and run `npm run generate` (editing the generated file is blocked).
- Every public export lives in `src/index.ts`; changing an exported signature is a breaking change and needs a note in the plan.

## Architecture
- `src/money.ts`: parsing, arithmetic, allocation and formatting. High risk (it is the public API).
- `src/gen/`: generated currency table (protected).
- `scripts/`: code generators.
- `test/`: `node --test` suites over the sources.

## Things Claude gets wrong
<!-- Filled in through use. Rule: same mistake twice → it goes here. -->
