# Stack · Go
<!-- Org decisions. Platform owns this file; changes via PR. -->

## Tools
| Role | Tool | Notes |
|---|---|---|
| Build | **go** (modules) | the Go version comes from `go.mod` |
| Formatting | **gofmt** | `goimports` if the team already uses it |
| Lint | `go vet` (+ **golangci-lint** if the repo has `.golangci.yml`) | |
| Tests | `go test` (table-driven; `testdata/` for fixtures) | `-race` in CI |
| API (project_type = api) | `net/http` + the team's router | generated code (protobuf, controller-gen) is committed and never edited by hand |

## Makefile
```make
.PHONY: build test lint format run
build:  ; go build ./...
test:   ; go test ./...
lint:   ; go vet ./...
format: ; gofmt -w .
run:    ; go run ./cmd/...
```
With golangci-lint: `lint: ; golangci-lint run`.
If the project is empty: `go mod init <module>` and a `cmd/<name>/main.go`.

## sdlc.json
```json
"stack": { "language": "go", "package_manager": "go", "project_type": "<api|library|cli>" },
"format_on_edit": { "*.go": "gofmt -w {file}" },
"test_globs": ["**/*_test.go", "testdata/**"],
"protected_paths": ["**/*.pb.go", "**/zz_generated*.go"]
```
Generated files change by running the generator (`buf generate`, `go generate ./...`, `controller-gen`), not by hand. The commit that regenerates them needs a code owner (`SDLC_OVERRIDE=protected-paths`).

## permissions.allow (inner loop)
```json
["Bash(make build)", "Bash(make test)", "Bash(make lint)", "Bash(make format)", "Bash(make run)",
 "Bash(go build:*)", "Bash(go test:*)", "Bash(go vet:*)", "Bash(gofmt:*)", "Bash(go mod tidy)",
 "Bash(git status)", "Bash(git diff:*)", "Bash(git log:*)"]
```

## Conventions for CLAUDE.md (seeds)
- Errors are wrapped with context (`fmt.Errorf("…: %w", err)`), never discarded.
- `context.Context` is the first parameter of anything that does I/O.
- No new dependency without asking: the standard library first.
- No global state; dependencies are passed in.

## CI
- **GitHub** (`# >>> stack`):
  ```yaml
  - uses: actions/setup-go@v5
    with: { go-version-file: go.mod }
  ```
- **GitLab**: `image: golang:1`.
- **Bitbucket**: `image: golang:1`.
