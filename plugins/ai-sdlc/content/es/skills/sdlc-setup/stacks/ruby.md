# Stack · Ruby on Rails
<!-- Decisiones de la org. Plataforma es owner de este archivo; cambios por PR. -->

## Herramientas
| Rol | Herramienta | Notas |
|---|---|---|
| Dependencias | **Bundler** (`Gemfile.lock` commiteado) | versión de Ruby en `.ruby-version` |
| Formato y lint | **RuboCop** (`rubocop-rails-omakase` o el `.rubocop.yml` del equipo) | |
| Tests | **Minitest** (`bin/rails test`) o **RSpec** si el repo tiene `spec/` | `sdlc init` elige `bundle exec rspec` cuando encuentra `spec/` o `.rspec` |
| API (project_type = api) | Rails (`--api` si no hay frontend) | migraciones en `db/migrate`, schema en `db/schema.rb` |

## Makefile
```make
.PHONY: build test lint format run
build:  ; bin/rails zeitwerk:check
test:   ; bin/rails test
lint:   ; bundle exec rubocop
format: ; bundle exec rubocop -a
run:    ; bin/rails server
```
Con RSpec: `test: ; bundle exec rspec`.
Si el proyecto está vacío: `rails new <app> --database=postgresql` (con `--api` para una API).

## sdlc.json
```json
"stack": { "language": "ruby", "package_manager": "bundler", "project_type": "<api|web|library>" },
"format_on_edit": { "*.rb": "bundle exec rubocop -a {file}" },
"test_globs": ["test/**", "spec/**"],
"protected_paths": ["db/schema.rb", "db/structure.sql"],
"append_only_paths": ["db/migrate/**"]
```
Las migraciones son de solo agregar: `bin/rails generate migration` crea nuevas, pero una migración aplicada nunca se edita; se corrige con una nueva. `db/schema.rb` lo genera `bin/rails db:migrate` y nunca se edita a mano, así que el commit que suma una migración junto con el schema regenerado necesita un code owner (`SDLC_OVERRIDE=protected-paths git commit …`). Si el equipo prefiere que el agente commitee migraciones solo, sacá `db/schema.rb` de `protected_paths`.

## permissions.allow (inner loop)
```json
["Bash(make build)", "Bash(make test)", "Bash(make lint)", "Bash(make format)", "Bash(make run)",
 "Bash(bin/rails test:*)", "Bash(bundle exec rspec:*)", "Bash(bundle exec rubocop:*)",
 "Bash(bin/rails generate migration:*)", "Bash(bin/rails db:migrate)", "Bash(bundle install)",
 "Bash(git status)", "Bash(git diff:*)", "Bash(git log:*)"]
```

## Convenciones para CLAUDE.md (semillas)
- La lógica de negocio fuera de los controllers (modelos o service objects).
- Sin queries N+1: `includes` al recorrer asociaciones; toda query nueva tiene índice.
- Toda migración es reversible (`change`, o `up` con `down`).
- Sin gemas nuevas sin preguntar.

## CI
- **GitHub** (`# >>> stack`):
  ```yaml
  - uses: ruby/setup-ruby@v1
    with: { bundler-cache: true }
  ```
  Los tests necesitan base de datos: sumá un bloque `services: postgres` y `bin/rails db:prepare` antes de `make test`.
- **GitLab**: `image: ruby:3.4`.
- **Bitbucket**: `image: ruby:3.4`.
