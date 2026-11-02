# Stack · Go
<!-- Decisiones de la org. Plataforma es owner de este archivo; cambios por PR. -->

## Herramientas
| Rol | Herramienta | Notas |
|---|---|---|
| Build | **go** (módulos) | la versión de Go sale de `go.mod` |
| Formato | **gofmt** | `goimports` si el equipo ya lo usa |
| Lint | `go vet` (+ **golangci-lint** si el repo tiene `.golangci.yml`) | |
| Tests | `go test` (table-driven; `testdata/` para fixtures) | `-race` en CI |
| API (project_type = api) | `net/http` + el router del equipo | el código generado (protobuf, controller-gen) se commitea y nunca se edita a mano |

## Makefile
```make
.PHONY: build test lint format run
build:  ; go build ./...
test:   ; go test ./...
lint:   ; go vet ./...
format: ; gofmt -w .
run:    ; go run ./cmd/...
```
Con golangci-lint: `lint: ; golangci-lint run`.
Si el proyecto está vacío: `go mod init <módulo>` y un `cmd/<nombre>/main.go`.

## sdlc.json
```json
"stack": { "language": "go", "package_manager": "go", "project_type": "<api|library|cli>" },
"format_on_edit": { "*.go": "gofmt -w {file}" },
"test_globs": ["**/*_test.go", "testdata/**"],
"protected_paths": ["**/*.pb.go", "**/zz_generated*.go"]
```
Los archivos generados cambian corriendo el generador (`buf generate`, `go generate ./...`, `controller-gen`), no a mano. El commit que los regenera necesita un code owner (`SDLC_OVERRIDE=protected-paths`).

## permissions.allow (inner loop)
```json
["Bash(make build)", "Bash(make test)", "Bash(make lint)", "Bash(make format)", "Bash(make run)",
 "Bash(go build:*)", "Bash(go test:*)", "Bash(go vet:*)", "Bash(gofmt:*)", "Bash(go mod tidy)",
 "Bash(git status)", "Bash(git diff:*)", "Bash(git log:*)"]
```

## Convenciones para CLAUDE.md (semillas)
- Los errores se envuelven con contexto (`fmt.Errorf("…: %w", err)`), nunca se descartan.
- `context.Context` es el primer parámetro de todo lo que hace I/O.
- Sin dependencias nuevas sin preguntar: primero la librería estándar.
- Sin estado global; las dependencias se pasan.

## CI
- **GitHub** (`# >>> stack`):
  ```yaml
  - uses: actions/setup-go@v5
    with: { go-version-file: go.mod }
  ```
- **GitLab**: `image: golang:1`.
- **Bitbucket**: `image: golang:1`.
