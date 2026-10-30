# Stack · TypeScript
<!-- Decisiones de la org. Plataforma es owner de este archivo; cambios por PR. -->

## Herramientas
| Rol | Herramienta | Notas |
|---|---|---|
| Paquetes | **pnpm** | `pnpm-lock.yaml` commiteado; Node LTS (`.nvmrc`) |
| Formato + lint | **Biome** para proyectos nuevos | si el repo ya usa ESLint + Prettier, respetarlo |
| Tests | **Vitest** | frontend: + Testing Library; e2e: Playwright |
| Type check | `tsc --noEmit` | es parte de `build` |
| Frontend (project_type = frontend) | Next.js o Vite + React según el equipo | preguntar |
| API (project_type = api) | Fastify o NestJS según el equipo | migraciones (Prisma/Drizzle) en `prisma/migrations` o `drizzle/` |

## Makefile
```make
.PHONY: build test lint format run
build:  ; pnpm install --frozen-lockfile && pnpm exec tsc --noEmit && pnpm build
test:   ; pnpm exec vitest run
lint:   ; pnpm exec biome check .
format: ; pnpm exec biome check --write .
run:    ; pnpm dev
```
Si el proyecto está vacío: `pnpm init`, `pnpm add -D typescript vitest @biomejs/biome`, `tsconfig.json` strict y un test trivial.

## sdlc.json
```json
"stack": { "language": "typescript", "package_manager": "pnpm", "project_type": "<frontend|api|library|cli>" },
"format_on_edit": { "*.ts": "pnpm exec biome format --write {file}", "*.tsx": "pnpm exec biome format --write {file}" },
"test_globs": ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/__tests__/**", "e2e/**", "tests/**"],
"protected_paths": ["prisma/migrations/**", "drizzle/**", "src/gen/**", "**/*.generated.ts"]
```
Con ESLint + Prettier: `"*.ts": "pnpm exec prettier --write {file}"`.

## permissions.allow (inner loop)
```json
["Bash(make build)", "Bash(make test)", "Bash(make lint)", "Bash(make format)", "Bash(make run)",
 "Bash(pnpm exec vitest:*)", "Bash(pnpm exec tsc:*)", "Bash(pnpm exec biome:*)", "Bash(pnpm test:*)", "Bash(pnpm build)",
 "Bash(git status)", "Bash(git diff:*)", "Bash(git log:*)"]
```
`pnpm add` **no** va en allow.

## Convenciones para CLAUDE.md (semillas)
- `strict: true`; sin `any` salvo justificado con comentario.
- Tests junto al código (`*.test.ts`) salvo e2e.
- Frontend: componentes accesibles (roles y labels); sin estilos inline nuevos.
- Imports absolutos desde `src/` vía alias si el proyecto lo define.

## CI
- **GitHub** (`# >>> stack`):
  ```yaml
  - uses: pnpm/action-setup@v4
  - uses: actions/setup-node@v4
    with: { node-version-file: .nvmrc, cache: pnpm }
  ```
- **GitLab**: `image: node:20` + `before_script: [corepack enable]`.
- **Bitbucket**: `image: node:20` y en el setup `- corepack enable`.
