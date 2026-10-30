# Stack · TypeScript
<!-- Org decisions. Platform owns this file; changes via PR. -->

## Tools
| Role | Tool | Notes |
|---|---|---|
| Packages | **pnpm** | `pnpm-lock.yaml` committed; Node LTS (`.nvmrc`) |
| Formatting + lint | **Biome** for new projects | if the repo already uses ESLint + Prettier, keep it |
| Tests | **Vitest** | frontend: + Testing Library; e2e: Playwright |
| Type check | `tsc --noEmit` | part of `build` |
| Frontend (project_type = frontend) | Next.js or Vite + React depending on the team | ask |
| API (project_type = api) | Fastify or NestJS depending on the team | migrations (Prisma/Drizzle) in `prisma/migrations` or `drizzle/` |

## Makefile
```make
.PHONY: build test lint format run
build:  ; pnpm install --frozen-lockfile && pnpm exec tsc --noEmit && pnpm build
test:   ; pnpm exec vitest run
lint:   ; pnpm exec biome check .
format: ; pnpm exec biome check --write .
run:    ; pnpm dev
```
If the project is empty: `pnpm init`, `pnpm add -D typescript vitest @biomejs/biome`, a strict `tsconfig.json` and a trivial test.

## sdlc.json
```json
"stack": { "language": "typescript", "package_manager": "pnpm", "project_type": "<frontend|api|library|cli>" },
"format_on_edit": { "*.ts": "pnpm exec biome format --write {file}", "*.tsx": "pnpm exec biome format --write {file}" },
"test_globs": ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/__tests__/**", "e2e/**", "tests/**"],
"protected_paths": ["prisma/migrations/**", "drizzle/**", "src/gen/**", "**/*.generated.ts"]
```
With ESLint + Prettier: `"*.ts": "pnpm exec prettier --write {file}"`.

## permissions.allow (inner loop)
```json
["Bash(make build)", "Bash(make test)", "Bash(make lint)", "Bash(make format)", "Bash(make run)",
 "Bash(pnpm exec vitest:*)", "Bash(pnpm exec tsc:*)", "Bash(pnpm exec biome:*)", "Bash(pnpm test:*)", "Bash(pnpm build)",
 "Bash(git status)", "Bash(git diff:*)", "Bash(git log:*)"]
```
`pnpm add` does **not** go in allow.

## Conventions for CLAUDE.md (seeds)
- `strict: true`; no `any` unless justified with a comment.
- Tests next to the code (`*.test.ts`) except e2e.
- Frontend: accessible components (roles and labels); no new inline styles.
- Absolute imports from `src/` via alias if the project defines one.

## CI
- **GitHub** (`# >>> stack`):
  ```yaml
  - uses: pnpm/action-setup@v4
  - uses: actions/setup-node@v4
    with: { node-version-file: .nvmrc, cache: pnpm }
  ```
- **GitLab**: `image: node:20` + `before_script: [corepack enable]`.
- **Bitbucket**: `image: node:20` and in the setup `- corepack enable`.
