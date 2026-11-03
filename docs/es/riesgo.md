# Niveles de riesgo

Un arreglo en la documentación y un cambio en el middleware de auth no tienen el mismo riesgo, así que no deberían tener el mismo review. Cada cambio tiene un **nivel de riesgo** (`low`, `medium` o `high`) que lo fija el cambio, no quien lo escribe. `sdlc risk` lo muestra en tu máquina; `sdlc ci risk` lo mantiene en un comentario fijo de la PR.

## Cómo se calcula

El nivel es el más alto de estas señales. Ninguna puede bajarlo.

1. **El diff contra la rama base.** Un clasificador determinístico mira:
   - rutas en `risk.high_risk_paths` (high);
   - rutas en `risk.always_human_paths` (como mínimo medium). Por defecto son los workflows de CI, `.sdlc/**` y `REVIEW.md`: un cambio que edita los controles nunca es de riesgo low;
   - manifiestos de dependencias y lockfiles, `protected_paths`, `append_only_paths` y archivos de código borrados (medium);
   - el tamaño, en líneas de código ponderadas: las modificadas y borradas cuentan completas, las de archivos nuevos cuentan la mitad, y docs y `test_globs` no cuentan. Más de `risk.size.low_max_lines` (50) es medium; `risk.size.high_min_lines` (800) o más es high.
2. **Las rutas que nombran la spec y el plan.** Antes de que exista código, las rutas entre backticks de `spec.md` y `plan.md` (`src/auth/session.ts`, `infra/`) pasan por el mismo clasificador, así que el alcance planeado también cuenta.
3. **El `risk:` declarado** en el frontmatter de la spec o el plan.
4. **Un segundo clasificador** (opcional, `risk.agent_escalation: true`). Un agente de solo lectura lee el diff, la spec y el plan, y responde una sola pregunta: ¿este cambio necesita otra persona aunque su nivel diga que no? Escala por auth, dinero, migraciones irreversibles, contratos públicos, concurrencia, límites de seguridad, workflows de CI y de release, y patrones que otros van a copiar.

```console
$ sdlc risk
changes/2026-11-session-timeout: high risk (4 files against main, 38 weighted lines of code)
  high   src/auth/session.ts is a high-risk path (src/auth/**)
```

## Arrancá estricto

`risk.profile` es `strict` por defecto: cada gate sigue necesitando una persona y el nivel solo informa (el comentario de la PR, la profundidad del review). Pasá a `graded` cuando tengas datos que lo respalden: `sdlc metrics` muestra el tiempo humano por PR junto a la tasa de reverts e incidentes.
