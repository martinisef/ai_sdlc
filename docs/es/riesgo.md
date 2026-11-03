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

## Aprobaciones por nivel

Con `risk.profile: graded`, cuántas personas tienen que aprobar escala con el nivel. Los valores por defecto (se cambian en `risk.tiers`):

| Nivel | Aprobaciones humanas | Ejemplos |
|---|---|---|
| low | ninguna, una vez que los controles automáticos están en verde | docs, textos, cambios chicos y aditivos |
| medium | una persona | cambios de producto comunes, dependencias, archivos de CI |
| high | dos personas | `risk.high_risk_paths`, cambios grandes, lo que escale el segundo clasificador |

Las reglas que lo hacen seguro:

- **El intent siempre lo aprueba una persona.** Decidir si algo se construye no se delega, sea cual sea el nivel.
- **La spec y el plan siguen al nivel.** En low, `sdlc approve <cambio> spec --auto` registra la aprobación como `sdlc (risk low)` (lo corren las skills); se niega cuando el nivel o el autor piden una persona. En high el gate queda en `draft` después de la primera aprobación (`approved_by: Ana`) y se abre con la segunda (`approved_by: Ana, Juan`). Cada aprobación guarda `approved_sha` y `approved_tier`.
- **Si el cambio crece, el gate se vuelve a abrir.** Una aprobación dada en low no alcanza cuando el diff vuelve el cambio medium: `sdlc/gates` vuelve a pending hasta que alguien apruebe.
- **Las aprobaciones del código son los reviews del forge**, y `sdlc ci gate-status` las cuenta contra el nivel del diff de la PR. Poné en 0 las "required approvals" de la branch protection y exigí `sdlc/gates`.
- **Una aprobación cubre un commit.** Un review de GitHub queda atado al commit en que se dio. Sigue valiendo después de commits de autores de confianza, commits de gates y merges limpios; un push de un agente, un merge resuelto a mano o un force-push la invalidan. En GitLab y Bitbucket, activá "remove approvals when commits are added" / "reset approvals on changes".
- **La persona que dirige al agente cuenta como un reviewer** (el autor de la PR, o el autor del intent si la abrió un bot), siempre que sea de confianza. En high además tiene que aprobar otra persona.
- **Solo los autores de confianza tienen los caminos livianos.** `risk.trusted_authors` (nombre de git, email o `@login`; sin definir son todos los de `roles`). Cualquier otro siempre necesita otra persona, y quien dirige no cuenta.
- **La aprobación de un agente nunca cuenta**, ni en los artefactos ni en la PR.

## Arrancá estricto

`risk.profile` es `strict` por defecto: cada gate sigue necesitando una persona y el nivel solo informa (el comentario de la PR, la profundidad del review). Pasá a `graded` cuando tengas datos que lo respalden: `sdlc metrics` muestra el tiempo humano por PR junto a la tasa de reverts e incidentes.
