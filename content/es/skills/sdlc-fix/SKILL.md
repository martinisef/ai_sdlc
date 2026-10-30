---
name: sdlc-fix
description: Stage 4 (Test) del loop AI-native para bugs. Reproduce el bug como un test que falla, lo commitea, activa el test-lock y recién entonces arregla el código sin poder tocar el test. Usar cuando hay que arreglar un bug, un test rojo en producción o un incidente con fix acotado.
argument-hint: "[descripción del bug | PROJ-123 | changes/<slug>]"
---

# /sdlc-fix — primero el test que falla

Un test que existía antes del fix, y que el agente no pudo reescribir, es la prueba de que el bug ya no está.

CLI del loop: `sdlc` ({{sdlc_hint}}). Comandos: `.sdlc/config.json → commands`.

## 0. Contexto del cambio
- Si el bug es parte de un cambio en curso, trabajá en su rama.
- Si es un bug nuevo: creá un cambio liviano. Rama `change/<slug>` (o `change/<KEY>-<slug>` con ticket), carpeta `changes/<...>/` con un `intent.md` corto (`origin: ticket|incident`) y un `plan.md` breve (archivos, prueba = el test que vas a escribir). Para bugs chicos alcanza con que el engineer acepte el plan en la sesión; no hace falta spec.
- Con ticket y Jira: leelo (MCP o `sdlc tracker get <KEY>`).

## 1. Reproducir
1. Escribí un test que reproduzca el bug en la ubicación de tests del proyecto (`test_globs`).
2. Corrélo y **confirmá que falla por la razón esperada** (no por un import roto o un setup mal hecho). Mostrá la salida.
3. Commit del test solo: `test(<slug>): reproduce <bug>`.

## 2. Activar el test-lock
`sdlc lock on`. Desde acá el hook `test-lock` bloquea cualquier edición a archivos de test.

## 3. Arreglar
- Cambiá el código hasta que el test pase, sin editar ningún test.
- Corré la suite completa: el fix no puede romper otra cosa.
- Si te convencés de que el test está mal escrito, **no lo cambies vos**: explicáselo al engineer; él decide si libera el lock.

## 4. Cerrar
1. Con todo verde, `sdlc lock off`.
2. Commit del fix: `fix(<slug>): <qué>` (+ key).
3. Si el bug vino de un incidente, proponé agregar un eval en `evals/` con este caso (ver `/sdlc-incident`).
4. **Siguiente paso**: "`/sdlc-ship` para abrir el PR". El review va a verificar que el test no cambió después de su commit.
