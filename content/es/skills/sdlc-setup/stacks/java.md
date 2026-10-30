# Stack · Java
<!-- Decisiones de la org. Plataforma es owner de este archivo; cambios por PR. -->

## Herramientas
| Rol | Herramienta | Notas |
|---|---|---|
| Build | **Gradle** (Kotlin DSL, wrapper commiteado) | si el repo ya usa Maven, respetarlo |
| Formato | **Spotless** + google-java-format | |
| Lint | Spotless check + `-Werror` en compilación (opcional: Error Prone) | |
| Tests | **JUnit 5** (+ Testcontainers para integración) | |
| API (project_type = api) | Spring Boot 3 | migraciones Flyway en `src/main/resources/db/migration` |

Versión de Java: LTS vigente de la org (21 por defecto).

## Makefile
```make
.PHONY: build test lint format run
build:  ; ./gradlew assemble -q
test:   ; ./gradlew test
lint:   ; ./gradlew spotlessCheck
format: ; ./gradlew spotlessApply
run:    ; ./gradlew bootRun
```
Maven: `./mvnw -q package -DskipTests`, `./mvnw test`, `./mvnw spotless:check`.
Si el proyecto está vacío: `gradle init --type java-application --dsl kotlin --test-framework junit-jupiter` y agregar el plugin Spotless.

## sdlc.json
```json
"stack": { "language": "java", "package_manager": "gradle", "project_type": "<api|library|cli>" },
"format_on_edit": {},
"test_globs": ["src/test/**", "src/integrationTest/**", "src/itest/**"],
"protected_paths": ["src/main/resources/db/migration/**", "build/generated/**", "**/generated/**"]
```
`format_on_edit` queda vacío por defecto: Spotless por archivo es lento (arranca Gradle). Si el equipo tiene `google-java-format` instalado localmente: `"*.java": "google-java-format -i {file}"`. Si no, el formato se corrige con `make format` antes del commit.

## permissions.allow (inner loop)
```json
["Bash(make build)", "Bash(make test)", "Bash(make lint)", "Bash(make format)", "Bash(make run)",
 "Bash(./gradlew test:*)", "Bash(./gradlew assemble:*)", "Bash(./gradlew spotlessApply)", "Bash(./gradlew spotlessCheck)",
 "Bash(git status)", "Bash(git diff:*)", "Bash(git log:*)"]
```

## Convenciones para CLAUDE.md (semillas)
- Dinero siempre `BigDecimal`, nunca `double`.
- Sin Lombok nuevo (o la decisión del equipo).
- Todo endpoint nuevo con test de integración.
- No subir versiones de dependencias: las gestiona plataforma.

## CI
- **GitHub** (`# >>> stack`):
  ```yaml
  - uses: actions/setup-java@v4
    with: { distribution: temurin, java-version: '21', cache: gradle }
  ```
- **GitLab**: `image: eclipse-temurin:21-jdk`.
- **Bitbucket**: `image: eclipse-temurin:21-jdk` (+ `caches: [gradle]` en el step).
