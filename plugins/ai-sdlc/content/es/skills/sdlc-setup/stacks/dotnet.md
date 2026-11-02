# Stack · .NET
<!-- Decisiones de la org. Plataforma es owner de este archivo; cambios por PR. -->

## Herramientas
| Rol | Herramienta | Notas |
|---|---|---|
| Build | CLI **dotnet** (solución `.sln` en la raíz) | SDK fijado en `global.json` |
| Formato | **dotnet format** (reglas en `.editorconfig`) | |
| Lint | `dotnet format --verify-no-changes` + analizadores con `TreatWarningsAsErrors` | |
| Tests | **xUnit** (un proyecto `<Proyecto>.Tests` por proyecto) | Testcontainers para integración |
| API (project_type = api) | ASP.NET Core + EF Core | migraciones en `Migrations/` |

Versión de .NET: LTS vigente de la org (10 por defecto).

## Makefile
```make
.PHONY: build test lint format run
build:  ; dotnet build
test:   ; dotnet test
lint:   ; dotnet format --verify-no-changes
format: ; dotnet format
run:    ; dotnet run --project src/<App>
```
Si el proyecto está vacío: `dotnet new sln`, `dotnet new webapi -o src/<App>`, `dotnet new xunit -o tests/<App>.Tests` y `dotnet sln add` para los dos.

## sdlc.json
```json
"stack": { "language": "dotnet", "package_manager": "dotnet", "project_type": "<api|library|cli>" },
"format_on_edit": {},
"test_globs": ["tests/**", "test/**", "**/*.Tests/**", "**/*.Test/**", "**/*Tests.cs"],
"protected_paths": ["**/*.g.cs"],
"append_only_paths": ["**/Migrations/*.Designer.cs", "**/Migrations/2*.cs"]
```
`format_on_edit` queda vacío por defecto: `dotnet format` carga toda la solución y es demasiado lento por archivo. El formato se corrige con `make format` antes del commit.

Las migraciones de EF Core (`<timestamp>_<Nombre>.cs` y su `.Designer.cs`) son de solo agregar: `dotnet ef migrations add` crea nuevas, pero una migración aplicada nunca se edita; se corrige con una nueva. El snapshot del modelo (`*ModelSnapshot.cs`) no está protegido, porque cada migración nueva lo actualiza.

## permissions.allow (inner loop)
```json
["Bash(make build)", "Bash(make test)", "Bash(make lint)", "Bash(make format)", "Bash(make run)",
 "Bash(dotnet build:*)", "Bash(dotnet test:*)", "Bash(dotnet format:*)", "Bash(dotnet ef migrations add:*)",
 "Bash(git status)", "Bash(git diff:*)", "Bash(git log:*)"]
```

## Convenciones para CLAUDE.md (semillas)
- Dinero siempre `decimal`, nunca `double`.
- Nullable reference types activados; nada de `!` para callar un warning.
- `async` de punta a punta: sin `.Result` ni `.Wait()`.
- No subir versiones de paquetes: las gestiona plataforma (`Directory.Packages.props`).

## CI
- **GitHub** (`# >>> stack`):
  ```yaml
  - uses: actions/setup-dotnet@v4
    with: { global-json-file: global.json }
  ```
  Sin `global.json`: `with: { dotnet-version: '10.0.x' }`.
- **GitLab**: `image: mcr.microsoft.com/dotnet/sdk:10.0`.
- **Bitbucket**: `image: mcr.microsoft.com/dotnet/sdk:10.0`.
