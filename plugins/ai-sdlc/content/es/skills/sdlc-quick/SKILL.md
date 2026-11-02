---
name: sdlc-quick
description: Carril rápido del loop AI-native. Implementa un cambio chico y de bajo riesgo (un texto, un campo, un ajuste menor de un endpoint) sin spec ni plan, con tests, dentro de los límites de quick_lane del proyecto. Usala cuando la persona pide un cambio chico y dice rápido, o hay un cambio activo con lane quick. Se niega y promueve el cambio al loop completo cuando toca rutas de alto riesgo o supera los límites.
argument-hint: "[qué cambiar | changes/<slug>]"
---

# /sdlc-quick — cambio chico, igual trazado

El carril rápido se saltea spec y plan, no la disciplina: sigue habiendo carpeta del cambio, rama, tests y PR. Los límites se chequean en cada push, así que un cambio rápido que crece se frena.

CLI del loop: `sdlc` ({{sdlc_hint}}). Comandos: `.sdlc/config.json → commands`. Límites: `quick_lane` (`max_files`, por defecto 10 archivos de código; `forbid_paths`) más `risk.high_risk_paths`.

## 0. ¿Es realmente rápido?
Antes de tocar código, decidilo con el pedido y una lectura rápida del código:
- ¿Qué archivos van a cambiar? Si alguno está en `risk.high_risk_paths` o `quick_lane.forbid_paths` (auth, pagos, stores de datos, migraciones, infra): **no es rápido**.
- Más archivos de código que `quick_lane.max_files`, una dependencia nueva, un cambio de esquema o de contrato, o una decisión de producto que alguien tiene que tomar: **no es rápido**.

Si no es rápido: no implementes. Corré `sdlc promote` (si ya existe el cambio rápido) y explicá por qué en una oración; el siguiente paso es `/sdlc-intent` y la aceptación del PO. Si todavía no hay cambio, proponé `sdlc new <slug>`.

## 1. Empezar
- Con un cambio activo cuyo `intent.md` tiene `lane: quick`: trabajá sobre él.
- Si no: `sdlc quick "<qué cambiar>"` crea `changes/<fecha>-<slug>/intent.md` (lane quick) en la rama `change/<slug>`.

## 2. Implementar
1. Si cambia comportamiento, escribí o actualizá primero el test que lo cubre; un cambio de texto o de config no necesita test nuevo.
2. Implementá el cambio más chico que lo resuelva.
3. Corré `commands.test` y `commands.lint` hasta verde. Si un test falla, arreglá el código, no el test.
4. `sdlc quick --check`: si dice que hay que promover, pará y promové (sección 0).
5. Commit: `feat(<slug>): <qué>` o `fix(<slug>): <qué>` (+ clave del ticket si hay).

Los hooks siguen aplicando: rutas protegidas, secretos, el production gate. Si un hook bloquea, no lo esquives.

## 3. Cerrar
Resumí qué cambió y la salida de los tests, y después el **siguiente paso**: "`/sdlc-ship` para abrir el PR". La revisión vuelve a chequear los límites del carril rápido.
