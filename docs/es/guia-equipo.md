# El loop en una página (para equipos)

El código ya no es el cuello de botella: movemos a las personas a los **gates** y dejamos que cada etapa produzca el artefacto que dispara la siguiente.

## Un cambio = una carpeta = una rama = un PR

```
changes/2026-10-claims-status/    rama: change/claims-status
  intent.md   spec.md   plan.md
```

## Los pasos

| # | Comando | Quién | Gate humano |
|---|---|---|---|
| 1 | `/sdlc-intent [PROJ-123]` | quien tiene la idea (PM, soporte, dev) | el **PO** acepta: `sdlc approve <cambio> intent` |
| 2 | `/sdlc-spec`, o automático en CI al aceptar el intent | el agente; revisa el PO | el **PO** resuelve las *áreas de preocupación* con cada owner y aprueba |
| 3 | `/sdlc-plan` (en plan mode) | engineer + agente | el **engineer** aprueba (tech lead si `risk: high`) |
| 4 | `/sdlc-build` | el agente implementa, el engineer dirige | ninguno (tests verdes + verifier) |
| 4b | `/sdlc-fix` | para bugs: primero el test que falla | ninguno |
| 5 | `/sdlc-ship [--babysit]` | el agente abre el PR/MR y lo cuida | el **code owner** aprueba el PR |
| 6 | `/sdlc-incident` | on-call + agente | el **on-call** triagea: fix now / schedule / dismiss |
| — | `/sdlc-status [--metrics]`, `sdlc ui` | cualquiera | — |
| — | `/sdlc-explain <módulo>` | cualquiera, antes de cambiar código que no conoce | — (documentación; `/sdlc-plan` lo cita) |

**Explainers de módulo.** `/sdlc-explain src/billing` escribe `docs/explainers/src-billing.md`: qué hace el módulo, su arquitectura, los invariantes de los que depende el código y los riesgos de tocarlo, cada uno con `archivo:línea`. Se genera bajo demanda, no en cada cambio. `/sdlc-plan` corre `sdlc explainers <rutas que cambian>`, cita los que encuentra y contrasta el plan con sus invariantes; un explainer queda desactualizado cuando el módulo recibe commits después de su `source_sha`, y `sdlc explainers` lo marca.

**Lo aprendido.** Cuando corregís al agente en una etapa de una forma que valdría la próxima vez (llamar SKU a un ítem de stock, correr el chequeo de migraciones antes de los tests), pregunta una vez: "¿Lo guardo para la próxima?". Si decís que sí, corre `sdlc learn`, que agrega una línea con fecha en **Cosas que Claude hace mal** de `CLAUDE.md`, y en `AGENTS.md` cuando ese adapter está activo (fuera del bloque que regenera `sdlc sync`), así todos los agentes la leen desde la próxima sesión. No pregunta por arreglos puntuales (un typo, un nombre) ni en corridas headless; si decís "guardalo", lo guarda sin preguntar. La misma regla dos veces queda una sola vez, y una línea que parece un secreto se rechaza. La línea se commitea con el cambio, así pasa por la revisión como todo lo demás. `sdlc learn list` las muestra, y `sdlc doctor` avisa cuando pasan de 30, el punto en que `CLAUDE.md` deja de entrar en una página: uní las que dicen lo mismo o pasalas a **Convenciones**.

Los gates son commits: `sdlc approve` / `sdlc reject` (o los botones del dashboard, `sdlc ui`) dejan `status`, `approved_by` y una línea `Gate: …` con tu identidad de git. Un agente o bot nunca puede aprobar, y el autor de un spec o plan tampoco puede aprobar el suyo.

## Reglas que hacen funcionar el loop

- **Nada se implementa sin un plan aprobado.** Corregir un documento es más barato que rehacer un diff.
- **Si te desviás del plan, actualizás `plan.md` en el mismo commit.** El review compara el diff contra el plan.
- **Si el agente comete el mismo error dos veces, la corrección va a `CLAUDE.md`** (o `AGENTS.md`). Si insiste, se vuelve un eval en `evals/`.
- **Los hooks no se rodean.** Si bloquean (ruta protegida, secreto, test durante un fix, deploy a prod), el mensaje dice el camino correcto.
- **El agente llega hasta el gate de producción y no lo pasa.** Aprobar y mergear es de una persona.
- **Jira acompaña, no bloquea.** Si una transición falla, se avisa y se sigue.

## Sesiones en paralelo

Si el plan tiene pasos independientes, abrí una sesión por paso, cada una en su worktree (por ejemplo `claude --worktree <nombre>`). Empezá con 2 o 3; el techo es cuánto podés revisar bien.

## Proyecto nuevo

```bash
npx @morsadev/sdlc init --locale es --preset team-github   # o solo, o regulated
```

`init` pregunta tres cosas (preset, PO y tech lead, como `@usuario` de GitHub o email), instala el CI del proveedor detectado (`--no-ci` lo omite) y con `--first-change "título"` crea el primer intent. Después abrí tu agente, corré `/sdlc-setup` para CLAUDE.md y REVIEW.md, y seguí SETUP.md.
