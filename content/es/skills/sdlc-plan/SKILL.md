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
2. `spec.md` con `status: approved`. Si no existe: para cambios chicos sin spec (bugfix, refactor acotado) se puede planificar desde `intent.md` aceptado; decilo explícitamente. Si la spec está en draft, frenar (solo cuenta `status`, no `approved_by`).
3. **Plan mode**: si la sesión no está en plan mode, pedile al usuario que lo active (Shift+Tab hasta "plan mode") antes de seguir. En plan mode Claude puede leer el repo pero no cambiar nada hasta que el plan se acepte. Si no se puede (ej. headless), trabajá en solo lectura hasta el paso 4.

## 1. Armar el plan
Leé intent.md, spec.md, CLAUDE.md y el código relevante. El plan tiene que nombrar:
- **Archivos que cambian** (nuevos y modificados) y para qué.
- **Orden de trabajo** en pasos chicos y verificables. Marcá qué pasos son independientes (candidatos a sesiones paralelas en worktrees).
- **Riesgos** y cómo se mitigan.
- **Prueba**: una línea por requerimiento de spec.md (`- R1: <test o check>`, sirven rangos como `R3–R5`), con comandos de `.sdlc/config.json → commands`, más los checks que no son de un requerimiento. Antes de presentar el plan, contrastalo con los requerimientos de la spec; cuando plan.md exista, `sdlc trace <slug>` lo verifica: cada `✗` es un requerimiento que el plan todavía no demuestra.
- **Alternativas descartadas** y por qué.

Explainers: cuando sepas qué archivos cambian, corré `sdlc explainers <esas rutas>`. Leé cada explainer que liste antes de diseñar, citalos en el plan (sección **Explainers**) y contrastá el plan con sus invariantes: un invariante que el cambio toca es un riesgo, y uno sin test necesita un test en el plan. Si alguno está desactualizado, decilo y sugerí `/sdlc-explain <módulo> --refresh`. Si un módulo que el plan cambia mucho no tiene explainer y nadie del equipo lo conoce bien, sugerí `/sdlc-explain <módulo>` antes de aceptar el plan.

## 2. Interrogarlo
Antes de presentarlo, respondete y mostrá:
- ¿Qué puede romper este cambio? ¿Cuál es el paso más riesgoso?
- ¿Qué otras opciones descartaste?
- ¿Toca `protected_paths` o `risk.high_risk_paths`? Si toca protegidas, el plan tiene que decir quién hace esa parte (los hooks van a bloquear la edición).
Invitá al engineer a corregir. Iterá hasta que **alguien que nunca vio esta conversación pueda implementar el cambio solo con el plan**.

## 3. Aceptación (gate)
El engineer acepta el plan (al salir de plan mode). Si `risk: high`, se necesita además un tech lead o arquitecto: dejalo en `status: draft` y pedí esa aprobación.

Con `risk.profile: graded`, el nivel decide cuántas personas (`sdlc risk <slug>`; cuentan las rutas que nombra el plan): low no necesita a nadie (`sdlc approve <slug> plan --auto` una vez escrito plan.md en draft), medium necesita al engineer, high necesita al engineer y una persona más (dejalo en `status: draft` con `approved_by: <engineer>` y pedí el segundo `sdlc approve`).

## 4. Registrar plan.md
Ya fuera de plan mode, escribí `changes/<slug>/plan.md` desde el template con el plan aceptado, `status: approved`, `approved_by: <engineer>`, `risk`. Corré `sdlc trace <slug>`: si reporta un requerimiento que el plan no cubre, ese no es el plan para registrar. Agregá cómo se verifica y confirmalo con el engineer, o dejá `status: draft` y decí por qué. Commit: `plan(<slug>): <título>` (+ key).
Tracker: transición `plan` + comentario con path y SHA (`jira-sot`: también resumen). Si falla, avisá y seguí.

## Guardar lo aprendido
Si la persona corrigió lo que hiciste o supusiste en esta etapa de una forma que valdría la próxima vez (un término, una convención, un chequeo para correr, algo que nunca hay que hacer), preguntá una vez por corrección, con sus palabras: "Me pediste <…>. ¿Lo guardo para la próxima?". Si dice que sí: `sdlc learn "<la regla, una línea en imperativo>" --stage plan --change <slug>`. No preguntes por arreglos puntuales (un typo, un nombre mal puesto, un valor), y nunca en corridas headless. Si te pide directamente que guardes algo ("la próxima usá las fixtures compartidas"), corrélo sin preguntar y decí en una línea dónde quedó. Commiteá `CLAUDE.md` (y `AGENTS.md`) con el cambio.

## Cierre
Una línea con el siguiente paso: "`/sdlc-build` para implementar contra el plan" (o, si hay pasos independientes, sugerir `claude --worktree <nombre>` por paso).
