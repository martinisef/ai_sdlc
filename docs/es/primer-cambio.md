# Tu primer cambio en 10 minutos

De un repositorio existente a un cambio mergeado: el agente escribe y vos decidís. Necesitás Node ≥ 22.18, git y un agente (Claude Code, Cursor, o Codex u otro que lea AGENTS.md).

::: tip ¿Es tu primera vez?
Esta página es la versión corta. [Empezá acá](./empezar/que-es.md) explica cada paso, usa una app de ejemplo chiquita y tiene un video de tres minutos.
:::

## 1. Configurar (1 minuto)

```bash
cd tu-repo
npm i -D @morsadev/sdlc
npx sdlc init --locale es --preset solo     # solo; para un equipo: --preset team-github
```

`init` detecta el stack, la forja y tus agentes, hace como mucho tres preguntas, instala los archivos del agente, los git hooks y las plantillas de CI, y termina con un resumen de cinco líneas y el siguiente paso.

Commitealo: `git add -A && git commit -m "chore: ai-sdlc"`. Si algo no está bien, `npx sdlc doctor --fix` arregla lo que puede y te dice lo que no.

## 2. Un cambio chico: el carril rápido (4 minutos)

Para un texto, un campo o un ajuste menor no hace falta spec ni plan:

```bash
npx sdlc quick "El endpoint de health devuelve el nombre del servicio"
```

Después, en tu agente: `/sdlc-quick`. Escribe o actualiza el test, implementa el cambio, corre tus comandos de test y lint, y commitea. Después `/sdlc-ship` abre el PR.

El carril rápido tiene límites, que se chequean en cada push: como mucho 10 archivos de código y nada bajo `risk.high_risk_paths` (auth, pagos, migraciones…). Si el cambio los supera, el push se bloquea y `npx sdlc promote` lo pasa al loop completo. `npx sdlc quick --check` te dice dónde estás.

## 3. Un cambio de verdad: el loop completo (5 minutos de tu tiempo)

```bash
npx sdlc new exportar-reclamos --title "Exportar reclamos a CSV"
```

En cualquier momento, `npx sdlc next` te dice lo único que hay que hacer ahora:

| `sdlc next` dice | Vos hacés |
|---|---|
| Siguiente: `/sdlc-intent` … | Contás el problema con tus palabras; el agente escribe `intent.md`. |
| Te toca decidir el intent → `sdlc approve exportar-reclamos intent` | Lo leés; aprobás o rechazás (`-m "por qué"`). |
| Siguiente: `/sdlc-spec` … | El agente escribe `spec.md` con criterios de aceptación y *areas of concern*. |
| Te toca decidir la spec → `sdlc approve exportar-reclamos spec` | Revisás los criterios: es el contrato. |
| Siguiente: `/sdlc-plan` … | El agente propone `plan.md`: archivos, orden, tests, riesgos. |
| Te toca decidir el plan → `sdlc approve exportar-reclamos plan` | Lo aprobás; recién ahora se puede escribir código (el pre-push lo exige). |
| Siguiente: `/sdlc-build` …, después `/sdlc-ship` | El agente implementa paso a paso hasta que los tests pasan y abre el PR. |

Las aprobaciones son commits con tu identidad: los agentes y bots no pueden aprobar, y en un equipo el PO aprueba intent y spec y el tech lead aprueba el plan. El dashboard (`npx sdlc ui`) muestra el mismo siguiente paso arriba, una bandeja con lo que te espera y un tablero con todos los cambios.

## 4. Qué tenés ahora

- Un cambio mergeado con su intent, spec y plan en `changes/`, enlazados al PR.
- Guardrails que se sostuvieron mientras el agente trabajaba: rutas protegidas, secretos, el production gate, plan antes que código.
- `npx sdlc metrics --funnel`: hasta dónde llegan los cambios en el loop.

Siguiente: la [guía para equipos](./guia-equipo.md).
