# Stack · Python
<!-- Decisiones de la org. Plataforma es owner de este archivo; cambios por PR. -->

## Herramientas
| Rol | Herramienta | Notas |
|---|---|---|
| Paquetes / entornos | **uv** | `pyproject.toml` + `uv.lock` commiteado |
| Formato + lint | **ruff** (`ruff format`, `ruff check`) | config en `pyproject.toml` |
| Tests | **pytest** | tests en `tests/`, archivos `test_*.py` |
| Tipos | **mypy** (opcional; recomendado en libs y APIs) | |
| API (si project_type = api) | FastAPI + Pydantic | migraciones con Alembic en `migrations/` |

Versión de Python: la última estable soportada por la org (preguntar si hay restricción).

## Makefile
```make
.PHONY: build test lint format run
build:  ; uv sync --frozen && uv run python -m compileall -q src
test:   ; uv run pytest -q
lint:   ; uv run ruff check . && uv run ruff format --check .
format: ; uv run ruff format . && uv run ruff check --fix .
run:    ; uv run python -m <paquete>          # API: uv run uvicorn <paquete>.main:app --reload
```
Si el proyecto está vacío: `uv init --package <nombre>`, `uv add --dev pytest ruff`, y un test trivial en `tests/test_smoke.py`.

## sdlc.json
```json
"stack": { "language": "python", "package_manager": "uv", "project_type": "<api|library|data|cli>" },
"format_on_edit": { "*.py": "uv run ruff format {file}" },
"test_globs": ["tests/**", "**/test_*.py", "**/*_test.py", "**/conftest.py"],
"protected_paths": ["migrations/versions/**", "**/*_pb2.py", "**/_generated/**"]
```
Agregar a `protected_paths` lo que el equipo indique (paquetes congelados, vendored).

## permissions.allow (inner loop)
```json
["Bash(make build)", "Bash(make test)", "Bash(make lint)", "Bash(make format)", "Bash(make run)",
 "Bash(uv run pytest:*)", "Bash(uv run ruff:*)", "Bash(uv run mypy:*)", "Bash(uv sync:*)", "Bash(git status)", "Bash(git diff:*)", "Bash(git log:*)"]
```
`uv add` **no** va en allow: agregar dependencias pide confirmación.

## Convenciones para CLAUDE.md (semillas)
- Código en `src/<paquete>/`, tests en `tests/` espejando la estructura.
- Type hints en funciones públicas. Sin `print` para logging: usar `logging`.
- Dependencias nuevas solo con `uv add` y justificadas en el plan.
- API: modelos Pydantic para request/response; nunca devolver modelos ORM directo.

## CI
- **GitHub** (`# >>> stack`):
  ```yaml
  - uses: astral-sh/setup-uv@v5
  - run: uv python install
  ```
- **GitLab**: `image: ghcr.io/astral-sh/uv:python3.12-bookworm` (bloque de imagen en `build`).
- **Bitbucket**: `image: ghcr.io/astral-sh/uv:python3.12-bookworm` (imagen global) y sin setup extra.
