---
name: sdlc-setup
description: Walkthrough que deja un proyecto listo para trabajar en el loop AI-native. Detecta o pregunta stack, proveedor (GitHub/GitLab/Bitbucket) y tracker (Jira), copia la estructura fija, genera la configuración específica (sdlc.json, Makefile, CLAUDE.md, REVIEW.md, CI, permisos), la verifica y registra el avance en SETUP.md. Es re-ejecutable y retoma lo pendiente. Usar al crear un proyecto nuevo, cuando piden "configurar el loop/SDLC", o cuando SETUP.md tiene pasos pendientes.
argument-hint: "[--resume | --only <ci|tracker|policies|claude-md>]"
---

# /sdlc-setup — proyecto listo para el loop

Rutas (relativas al directorio base de esta skill):
- `scaffold/` → parte **fija** que se copia al proyecto.
- `stacks/<lenguaje>.md` → decisiones de la org por stack (herramientas, comandos, permisos, CI).
- `ci/<provider>.md` + `ci/<provider>/` → plantillas de CI por proveedor.
- `trackers/<tracker>.md` → integración con el tracker.
- `reference/sdlc.schema.md` → contrato de `.sdlc/config.json`. `reference/defaults.json` → valores de la org (marketplace, etc.).
- CLI del loop: `sdlc` ({{sdlc_hint}}). `sdlc init` hace la parte determinística (detectar, config, scaffold, adapters de agentes); esta skill la completa con lo que requiere juicio.

Principio: **lo fijo se copia, lo específico se genera, y nada se marca como hecho sin verificarlo.**

## 0. Retomar
Si existe `SETUP.md`, leelo y continuá desde los ⬜ (salvo que pidan rehacer algo). Si existe `.sdlc/config.json`, usalo como defaults. Si solo existe `.claude/sdlc.json` (proyecto anterior), corré `sdlc migrate`.

## 1. Detectar (sin preguntar todavía)
- Manifests: `pyproject.toml`/`requirements*.txt` → python · `package.json`/`tsconfig.json` → typescript · `pom.xml`/`build.gradle*` → java · `go.mod` → go · otros → desconocido.
- `git remote get-url origin`: github.com → github · gitlab → gitlab (anotar host si es self-hosted) · bitbucket.org → bitbucket (anotar workspace/repo). Sin remote → preguntar.
- CI existente (`.github/workflows`, `.gitlab-ci.yml`, `bitbucket-pipelines.yml`), `CLAUDE.md`, `Makefile`, `.mcp.json`.
- Dependencias locales: Node ≥ 22 y `gh`/`glab` según provider. Si falta algo, decí cómo instalarlo; no lo instales sin permiso.
- Si no hay `.git`: `git init -b main` (preguntá antes).

## 2. Preguntar (AskUserQuestion, con lo detectado como opción recomendada)
Agrupá en 2-3 rondas, no más de 4 preguntas por ronda:
1. **Stack**: lenguaje/framework, gestor de paquetes (defaults de `stacks/<lang>.md`), tipo de proyecto (API / frontend / librería / data / CLI).
2. **Proveedor**: GitHub / GitLab (host, tier: Free/Premium/Ultimate) / Bitbucket Cloud (workspace). Default branch.
3. **Rutas sensibles**: ¿hay migraciones, código generado, IaC, paquetes congelados? → `protected_paths`. ¿Qué es alto riesgo (auth, pagos, infra)? → `risk.high_risk_paths`. ¿Cómo se deploya a producción? → `production_gate.patterns`.
4. **Tracker**: Jira o ninguno. Si es Jira, seguí `trackers/jira.md` (URL, project key, modo, mapeo de transiciones).
5. **Políticas**: qué skills de política de la org aplican (listá las disponibles en el plugin).
6. **Agentes**: qué agentes usa el equipo (Claude Code, Cursor, Codex u otros con AGENTS.md) → `agents` en la config.

## 3. Copiar lo fijo
Copiá `scaffold/` al proyecto **sin pisar archivos existentes**. Si un archivo ya existe (`CLAUDE.md`, `REVIEW.md`), mostrá qué secciones faltan y proponé agregarlas (merge), no reemplazar.
Agregá a `.gitignore`: `.claude/settings.local.json` (`.sdlc/.gitignore` ya excluye el estado local: `events.jsonl`, `fix-lock`).
Nada que hacer ejecutable: los evals y el CI corren con `sdlc ci` (`npx -y @morsadev/sdlc@0 ci …` en los pipelines).

## 4. Generar lo específico
Seguí `stacks/<lang>.md` (si no existe, `stacks/_unknown.md`) y `ci/<provider>.md`:
1. **`.sdlc/config.json`** según `reference/sdlc.schema.md` (si no existe, `sdlc init --yes` lo genera con lo detectado). Validalo con `sdlc doctor`.
   Después de editarlo, `sdlc sync` regenera los archivos de cada agente (`.cursor/`, `AGENTS.md`, git hooks).
2. **Makefile** (o el equivalente del stack) con `build`, `test`, `lint`, `format`, `run`: cada uno un solo comando que sale ≠ 0 si falla.
3. **`.claude/settings.json`**: `extraKnownMarketplaces` + `enabledPlugins` (de `reference/defaults.json`) y `permissions.allow` del inner loop del stack (para que las sesiones no esperen aprobación en comandos seguros). Si existe, mergeá.
   Si `defaults.json` todavía tiene `CHANGE-ME` (plataforma no publicó el marketplace), **no deduzcas el repo** del remote ni de otro lado: dejá `CHANGE-ME` en `settings.json` y en `plugin.marketplace_repo`, avisalo y anotalo como ⬜ en SETUP.md ("completar el repo del marketplace").
4. **CLAUDE.md**: si el proyecto ya tiene código, corré el análisis equivalente a `/init` y recortalo. Completá Comandos (los reales), Convenciones (del stack + respuestas), Arquitectura. **Menos de una página.**
5. **REVIEW.md**: completá "Qué significa Important acá" según tipo de proyecto (ej. API: contratos rotos, auth; frontend: accesibilidad, regresiones visuales) y "No reportar" (código generado, vendored).
6. **CI**: copiá las plantillas de `ci/<provider>/` a su ubicación (ver `ci/<provider>.md`) y completá los bloques `# >>> stack` con el setup del lenguaje de `stacks/<lang>.md`. Los pipelines solo deciden *cuándo*; la lógica es `sdlc ci <cmd>`, igual en los tres proveedores. Si el equipo no corre Claude en CI, configurá `ci.agent` (`codex` o `cursor`) en `.sdlc/config.json`.
7. **Tracker**: `.mcp.json` con el MCP de Atlassian y bloque `tracker` en sdlc.json (`trackers/jira.md`).
8. **Políticas**: listá en CLAUDE.md qué skills de política aplican a este repo.

## 5. Verificar (obligatorio)
- `make build`, `make test`, `make lint`: verdes. Si el proyecto está vacío, creá el mínimo (un módulo y un test trivial) para que el feedback loop funcione desde el día 1. Iterá hasta verde.
- `sdlc doctor` → sin errores; muestra qué guardrails quedan determinísticos para cada agente.
- Hooks: simulá un bloqueo y mostralo, por ejemplo
  `printf '{"tool_name":"Edit","tool_input":{"file_path":"<ruta protegida>/x"}}' | sdlc hook pre-tool --agent claude; echo $?` → 2.
- `sdlc vcs provider` → el provider correcto.
- Jira: `sdlc tracker statuses` y un `get` de un ticket de prueba; cada transición mapeada existe.
- CI: validar sintaxis (GitHub: YAML válido; GitLab: `glab ci lint` si está; Bitbucket: YAML válido).
- Evals: `sdlc ci evals` en local (necesita la CLI del agente y su API key) una vez que haya casos reales en `evals/`.
- Bands (si aplica Stage 6): `sdlc bands check --dry-run` lee cada fuente de `ops/bands.yaml` sin actuar.

## 6. Registrar
- Actualizá `SETUP.md`: ✅ / ⬜ / ➖ por play, con notas de lo que quedó pendiente y **por qué**.
- Agregá la sección "Configuración manual pendiente" con lo que no se puede hacer desde el repo (de `ci/<provider>.md`): branch protection, secrets, code owners.
- Commit: `chore(sdlc): setup del loop AI-native`.

## Stack sin referencia
Usá `stacks/_unknown.md`: elegí herramientas estándar del ecosistema, **avisá que no hay referencia de la org**, y dejá un borrador `stacks/<lang>.md` en `SETUP.md` (sección "Propuesta para el plugin") para que plataforma lo sume.

## Cierre
Resumen: qué quedó configurado, qué es manual (con pasos), y el siguiente paso: **`/sdlc-intent` para el primer cambio**.
