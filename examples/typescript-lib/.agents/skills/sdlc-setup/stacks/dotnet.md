# Stack · .NET
<!-- Org decisions. Platform owns this file; changes via PR. -->

## Tools
| Role | Tool | Notes |
|---|---|---|
| Build | **dotnet** CLI (solution `.sln` at the root) | SDK pinned in `global.json` |
| Formatting | **dotnet format** (rules in `.editorconfig`) | |
| Lint | `dotnet format --verify-no-changes` + analyzers with `TreatWarningsAsErrors` | |
| Tests | **xUnit** (one `<Project>.Tests` project per project) | Testcontainers for integration |
| API (project_type = api) | ASP.NET Core + EF Core | migrations in `Migrations/` |

.NET version: the org's current LTS (10 by default).

## Makefile
```make
.PHONY: build test lint format run
build:  ; dotnet build
test:   ; dotnet test
lint:   ; dotnet format --verify-no-changes
format: ; dotnet format
run:    ; dotnet run --project src/<App>
```
If the project is empty: `dotnet new sln`, `dotnet new webapi -o src/<App>`, `dotnet new xunit -o tests/<App>.Tests` and `dotnet sln add` for both.

## sdlc.json
```json
"stack": { "language": "dotnet", "package_manager": "dotnet", "project_type": "<api|library|cli>" },
"format_on_edit": {},
"test_globs": ["tests/**", "test/**", "**/*.Tests/**", "**/*.Test/**", "**/*Tests.cs"],
"protected_paths": ["**/*.g.cs"],
"append_only_paths": ["**/Migrations/*.Designer.cs", "**/Migrations/2*.cs"]
```
`format_on_edit` is empty by default: `dotnet format` loads the whole solution, which is too slow per file. Formatting gets fixed with `make format` before the commit.

EF Core migrations (`<timestamp>_<Name>.cs` and their `.Designer.cs`) are append-only: `dotnet ef migrations add` creates new ones, but an applied migration is never edited; it is corrected with a new one. The model snapshot (`*ModelSnapshot.cs`) is not protected, because every new migration updates it.

## permissions.allow (inner loop)
```json
["Bash(make build)", "Bash(make test)", "Bash(make lint)", "Bash(make format)", "Bash(make run)",
 "Bash(dotnet build:*)", "Bash(dotnet test:*)", "Bash(dotnet format:*)", "Bash(dotnet ef migrations add:*)",
 "Bash(git status)", "Bash(git diff:*)", "Bash(git log:*)"]
```

## Conventions for CLAUDE.md (seeds)
- Money is always `decimal`, never `double`.
- Nullable reference types on; no `!` to silence a warning.
- `async` all the way: no `.Result` or `.Wait()`.
- Don't bump package versions: platform manages them (`Directory.Packages.props`).

## CI
- **GitHub** (`# >>> stack`):
  ```yaml
  - uses: actions/setup-dotnet@v4
    with: { global-json-file: global.json }
  ```
  Without `global.json`: `with: { dotnet-version: '10.0.x' }`.
- **GitLab**: `image: mcr.microsoft.com/dotnet/sdk:10.0`.
- **Bitbucket**: `image: mcr.microsoft.com/dotnet/sdk:10.0`.
