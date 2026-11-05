# Contributing

Thanks for helping. Bug reports, docs fixes and pull requests are all welcome.

## Before you start

- **A bug:** open an [issue](https://github.com/martinisef/ai_sdlc/issues/new/choose) with the version (`npx sdlc --version`), your agent (Claude Code, Cursor, Codex…) and the output of `npx sdlc doctor`.
- **A feature or a change in behavior:** open an issue first, so we agree on it before you write code. Anything listed as stable in [Versions and stability](docs/reference/stability.md) cannot break within 1.x.
- **A security problem:** do not open an issue; see [SECURITY.md](SECURITY.md).

## Set up

Node ≥ 22.18 on macOS or Linux (on Windows, use WSL).

```bash
git clone https://github.com/martinisef/ai_sdlc && cd ai_sdlc
npm ci
```

The TypeScript sources run directly (`--conditions=source`), so tests need no build step.

## Check your change

Run these before opening the pull request; CI runs the same ones:

```bash
npm run typecheck
npm test                      # unit and integration tests
npm run test:bash             # hook parity and the docs tutorials
npm run build                 # UI, CLI bundle and plugins/ai-sdlc: commit the regenerated plugin
npx playwright test           # the dashboard (after npm run build)
npm run docs:build            # when you touch docs/
```

- **Help, `sdlc schema` or a `--json` output changed?** The contract tests in `packages/cli/test/contract.test.ts` fail on purpose. If the change is intended and does not remove anything, run `UPDATE_SNAPSHOTS=1 npm test` and commit the updated `packages/cli/test/snapshots/`. Removing or renaming a key or a flag is a breaking change.
- **Skills, subagents or templates?** Edit `content/en/` first, then `content/es/`, and run `npm run build`.
- **A new command or flag?** Add it to `docs/reference/cli.md`; a test checks that every command in `sdlc --help` is there.

## Pull requests

- One topic per pull request, with a title in [Conventional Commits](https://www.conventionalcommits.org) form (`feat:`, `fix:`, `docs:`…).
- User-facing change? Add a changeset with `npx changeset`: `patch` for fixes, `minor` for new features, `major` only for what breaks the [stability contract](docs/reference/stability.md).
- Fill in the template: what changed, how you tested it, the risk and how to revert.
- If a test fails, fix the code, not the test.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
