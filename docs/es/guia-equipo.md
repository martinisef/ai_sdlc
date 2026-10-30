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
npx @ai-native-sdlc/cli init --locale es     # después abrí tu agente, corré /sdlc-setup y seguí SETUP.md
```
