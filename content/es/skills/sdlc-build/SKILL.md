---
name: sdlc-build
description: Stage 3 (Build) del loop AI-native, segunda mitad. Implementa un cambio contra su plan.md aprobado con feedback loop (build/test/lint hasta verde), mantiene plan.md sincronizado y verifica con el subagent verifier antes de darlo por terminado. Usar cuando hay un plan aprobado y piden implementar.
argument-hint: "[changes/<slug> | número de paso del plan]"
---

# /sdlc-build — implementar contra el plan

CLI del loop: `sdlc` ({{sdlc_hint}}). Comandos del proyecto: `.sdlc/config.json → commands` (build, test, lint, run).

## 0. Prerequisitos
- `plan.md` del cambio activo con `status: approved`. Si no hay plan aprobado: **no implementes**. Ofrecé `/sdlc-plan`. (Excepción: el usuario pide explícitamente un cambio trivial fuera del loop; en ese caso decí que queda sin trazabilidad.)
- Árbol limpio o cambios entendidos.

## 1. Implementar
Seguí el **orden de trabajo** del plan, paso por paso:
1. Implementá el paso.
2. Corré el feedback loop: `commands.test` (y `build`/`lint` cuando corresponda). Iterá hasta verde **antes** de pasar al siguiente paso. Si un test falla, arreglá el código, no el test.
3. Commit por paso o por grupo lógico: `feat(<slug>): <qué>` (+ key si hay ticket, así Jira linkea el commit).

Los hooks del plugin van a frenar ediciones a rutas protegidas, secretos y tests durante un fix: si un hook bloquea, **no lo rodees**; leé el mensaje y seguí el camino que indica.

## 2. Desvíos
Si la implementación se aparta del plan (otro archivo, otro orden, un riesgo nuevo, otra prueba): actualizá `plan.md` → sección "Desvíos durante la implementación" **en el mismo commit** que el código. Si el desvío cambia el alcance de la spec, pará y consultá: puede requerir volver a Stage 2.

## 3. Verificación final
1. Corré build, test y lint completos y guardá la salida (va al PR).
2. Lanzá el subagent `verifier`: ejecuta la app, prueba el comportamiento cambiado y los flujos vecinos, y compara contra `plan.md`. Corre en un contexto limpio, así su veredicto no está sesgado por las suposiciones que produjeron el código.
3. Opcional: subagent `simplifier` sobre el diff si quedó complejidad innecesaria; volvé a correr los tests después.
4. Si es UI: comparar screenshot contra el mock de la spec (con la herramienta de browser/screenshot disponible), 2-3 rondas.

## Paralelismo
Si el plan marca pasos independientes que tocan archivos distintos, sugerí correrlos en sesiones paralelas: `claude --worktree <slug>-<paso>`. Pasos que comparten archivos van en una sola sesión, en orden.

## Cierre
Resumen corto: pasos hechos, desvíos registrados, salida de tests, veredicto del verifier. **Siguiente paso**: "`/sdlc-ship` para abrir el PR".
