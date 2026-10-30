# Stack · Java
<!-- Org decisions. Platform owns this file; changes via PR. -->

## Tools
| Role | Tool | Notes |
|---|---|---|
| Build | **Gradle** (Kotlin DSL, wrapper committed) | if the repo already uses Maven, keep it |
| Formatting | **Spotless** + google-java-format | |
| Lint | Spotless check + `-Werror` on compilation (optional: Error Prone) | |
| Tests | **JUnit 5** (+ Testcontainers for integration) | |
| API (project_type = api) | Spring Boot 3 | Flyway migrations in `src/main/resources/db/migration` |

Java version: the org's current LTS (21 by default).

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
If the project is empty: `gradle init --type java-application --dsl kotlin --test-framework junit-jupiter` and add the Spotless plugin.

## sdlc.json
```json
"stack": { "language": "java", "package_manager": "gradle", "project_type": "<api|library|cli>" },
"format_on_edit": {},
"test_globs": ["src/test/**", "src/integrationTest/**", "src/itest/**"],
"protected_paths": ["src/main/resources/db/migration/**", "build/generated/**", "**/generated/**"]
```
`format_on_edit` is empty by default: Spotless per file is slow (it starts Gradle). If the team has `google-java-format` installed locally: `"*.java": "google-java-format -i {file}"`. Otherwise, formatting gets fixed with `make format` before the commit.

## permissions.allow (inner loop)
```json
["Bash(make build)", "Bash(make test)", "Bash(make lint)", "Bash(make format)", "Bash(make run)",
 "Bash(./gradlew test:*)", "Bash(./gradlew assemble:*)", "Bash(./gradlew spotlessApply)", "Bash(./gradlew spotlessCheck)",
 "Bash(git status)", "Bash(git diff:*)", "Bash(git log:*)"]
```

## Conventions for CLAUDE.md (seeds)
- Money is always `BigDecimal`, never `double`.
- No new Lombok (or whatever the team decides).
- Every new endpoint comes with an integration test.
- Don't bump dependency versions: platform manages them.

## CI
- **GitHub** (`# >>> stack`):
  ```yaml
  - uses: actions/setup-java@v4
    with: { distribution: temurin, java-version: '21', cache: gradle }
  ```
- **GitLab**: `image: eclipse-temurin:21-jdk`.
- **Bitbucket**: `image: eclipse-temurin:21-jdk` (+ `caches: [gradle]` in the step).
