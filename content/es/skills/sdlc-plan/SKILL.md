---
name: sdlc-plan
description: Stage 3 (Build) del loop AI-native, primera mitad. Arma el plan de implementación en plan mode a partir de un spec.md aprobado, lo interroga y lo registra como plan.md aprobado. Usar cuando una spec fue aprobada, cuando piden "planificar" un cambio, o antes de implementar cualquier cosa no trivial.
argument-hint: "[changes/<slug> | slug]"
---

# /sdlc-plan — nada se implementa sin un plan aceptado

Objetivo: que el diseño se revise **antes** de generar código, cuando cambiar de rumbo todavía es editar un documento. El plan aprobado es lo que el review del PR va a comparar contra el diff.

CLI del loop: `sdlc` ({{sdlc_hint}}).

## 0. Prerequisitos
1. Cambio activo (rama `change/<slug>`) o `$ARGUMENTS`.
2. `spec.md` con `status: approved`. Si no existe: para cambios chicos sin spec (bugfix, refactor acotado) se puede planificar desde `intent.md` aceptado; decilo explícitamente. Si la spec está en draft, frenar.
3. **Plan mode**: si la sesión no está en plan mode, pedile al usuario que lo active (Shift+Tab hasta "plan mode") antes de seguir. En plan mode Claude puede leer el repo pero no cambiar nada hasta que el plan se acepte. Si no se puede (ej. headless), trabajá en solo lectura hasta el paso 4.

## 1. Armar el plan
Leé intent.md, spec.md, CLAUDE.md y el código relevante. El plan tiene que nombrar:
- **Archivos que cambian** (nuevos y modificados) y para qué.
- **Orden de trabajo** en pasos chicos y verificables. Marcá qué pasos son independientes (candidatos a sesiones paralelas en worktrees).
- **Riesgos** y cómo se mitigan.
- **Prueba**: los tests y checks que demuestran que funciona, con comandos de `.sdlc/config.json → commands`.
- **Alternativas descartadas** y por qué.

## 2. Interrogarlo
Antes de presentarlo, respondete y mostrá:
- ¿Qué puede romper este cambio? ¿Cuál es el paso más riesgoso?
- ¿Qué otras opciones descartaste?
- ¿Toca `protected_paths` o `risk.high_risk_paths`? Si toca protegidas, el plan tiene que decir quién hace esa parte (los hooks van a bloquear la edición).
Invitá al engineer a corregir. Iterá hasta que **alguien que nunca vio esta conversación pueda implementar el cambio solo con el plan**.

## 3. Aceptación (gate)
El engineer acepta el plan (al salir de plan mode). Si `risk: high`, se necesita además un tech lead o arquitecto: dejalo en `status: draft` y pedí esa aprobación.

## 4. Registrar plan.md
Ya fuera de plan mode, escribí `changes/<slug>/plan.md` desde el template con el plan aceptado, `status: approved`, `approved_by: <engineer>`, `risk`. Commit: `plan(<slug>): <título>` (+ key).
Jira: transición `plan` + comentario con path y SHA (`jira-sot`: también resumen). Si falla, avisá y seguí.

## Cierre
Una línea con el siguiente paso: "`/sdlc-build` para implementar contra el plan" (o, si hay pasos independientes, sugerir `claude --worktree <nombre>` por paso).
