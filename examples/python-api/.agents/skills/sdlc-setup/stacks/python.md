# Stack · Python
<!-- Org decisions. Platform owns this file; changes via PR. -->

## Tools
| Role | Tool | Notes |
|---|---|---|
| Packages / environments | **uv** | `pyproject.toml` + `uv.lock` committed |
| Formatting + lint | **ruff** (`ruff format`, `ruff check`) | config in `pyproject.toml` |
| Tests | **pytest** | tests in `tests/`, files `test_*.py` |
| Types | **mypy** (optional; recommended for libs and APIs) | |
| API (if project_type = api) | FastAPI + Pydantic | migrations with Alembic in `migrations/` |

Python version: the latest stable one supported by the org (ask whether there is a constraint).

## Makefile
```make
.PHONY: build test lint format run
build:  ; uv sync --frozen && uv run python -m compileall -q src
test:   ; uv run pytest -q
lint:   ; uv run ruff check . && uv run ruff format --check .
format: ; uv run ruff format . && uv run ruff check --fix .
run:    ; uv run python -m <package>          # API: uv run uvicorn <package>.main:app --reload
```
If the project is empty: `uv init --package <name>`, `uv add --dev pytest ruff`, and a trivial test in `tests/test_smoke.py`.

## sdlc.json
```json
"stack": { "language": "python", "package_manager": "uv", "project_type": "<api|library|data|cli>" },
"format_on_edit": { "*.py": "uv run ruff format {file}" },
"test_globs": ["tests/**", "**/test_*.py", "**/*_test.py", "**/conftest.py"],
"protected_paths": ["migrations/versions/**", "**/*_pb2.py", "**/_generated/**"]
```
Add to `protected_paths` whatever the team indicates (frozen packages, vendored code).

## permissions.allow (inner loop)
```json
["Bash(make build)", "Bash(make test)", "Bash(make lint)", "Bash(make format)", "Bash(make run)",
 "Bash(uv run pytest:*)", "Bash(uv run ruff:*)", "Bash(uv run mypy:*)", "Bash(uv sync:*)", "Bash(git status)", "Bash(git diff:*)", "Bash(git log:*)"]
```
`uv add` does **not** go in allow: adding dependencies asks for confirmation.

## Conventions for CLAUDE.md (seeds)
- Code in `src/<package>/`, tests in `tests/` mirroring the structure.
- Type hints on public functions. No `print` for logging: use `logging`.
- New dependencies only via `uv add` and justified in the plan.
- API: Pydantic models for request/response; never return ORM models directly.

## CI
- **GitHub** (`# >>> stack`):
  ```yaml
  - uses: astral-sh/setup-uv@v5
  - run: uv python install
  ```
- **GitLab**: `image: ghcr.io/astral-sh/uv:python3.12-bookworm` (image block in `build`).
- **Bitbucket**: `image: ghcr.io/astral-sh/uv:python3.12-bookworm` (global image) and no extra setup.
