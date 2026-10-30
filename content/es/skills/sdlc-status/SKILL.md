---
name: sdlc-status
description: Muestra en qué etapa del loop AI-native está cada cambio (changes/*), el estado de su PR/MR y de su ticket de Jira, marca inconsistencias y sugiere el próximo comando. Con --metrics calcula los indicadores del playbook desde git. Usar cuando preguntan "en qué estamos", "qué sigue", el estado de los cambios o métricas del loop.
argument-hint: "[--metrics]"
---

# /sdlc-status — dónde está cada cambio

CLI del loop: `sdlc` ({{sdlc_hint}}).

## Estado
1. `sdlc status --json` → un objeto por cambio: `change`, `stage`, `ticket`, `statuses` (intent/spec/plan), `active`, `next`.
2. Para el cambio activo (y para los otros si son pocos, ≤ 5): `sdlc vcs pr-current` desde su rama o buscando por rama, para saber si hay PR y su estado.
3. Si `tracker.provider = jira` y el cambio tiene ticket: estado del ticket (MCP de Atlassian o `sdlc tracker get <KEY>`).
4. Mostrá una tabla:

| Cambio | Etapa | Ticket (estado) | PR | Siguiente paso |
|---|---|---|---|---|

Marcá el activo con ▶.

## Inconsistencias a señalar
- Ticket *Done* pero PR abierto o sin mergear, o PR mergeado con ticket sin cerrar.
- Ticket todavía en *To Do* con spec o plan ya aprobados (falló una transición).
- `plan.md` aprobado pero la rama no tiene commits de código hace mucho (cambio estancado).
- Intent en draft hace más de 2 semanas (pedir decisión al PO).
- `.sdlc/fix-lock` presente sin un fix en curso.
No corrijas nada automáticamente: listá y ofrecé arreglarlo.

## --metrics
`sdlc status --metrics` y presentá los indicadores leading del playbook:
- Tiempo intent → spec (Stage 2: debería bajar de semanas a horas).
- Tiempo spec → plan.
- Rework de spec después del plan (commits a spec.md posteriores al primer plan.md: Stage 2 lagging).
Si hay PRs, agregá tiempo hasta el primer review y si mergearon en la primera pasada. Aclará que son métricas aproximadas sacadas de git.
