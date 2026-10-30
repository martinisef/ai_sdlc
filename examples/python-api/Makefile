.PHONY: build test lint format run
build:  ; uv sync --frozen && uv run python -m compileall -q src
test:   ; uv run pytest -q
lint:   ; uv run ruff check . && uv run ruff format --check .
format: ; uv run ruff format . && uv run ruff check --fix .
run:    ; uv run python -m claims
