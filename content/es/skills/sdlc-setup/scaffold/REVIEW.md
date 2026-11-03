# Instrucciones de review

## Passes
`sdlc ci review` corre un finder por pass y un verificador que vota cada finding. Etiquetá cada finding con su pass:
- **Bugs**: errores de lógica, edge cases rotos, regresiones sutiles.
- **Security**: inyección, huecos de autenticación/autorización, PII en logs o errores, secretos.
- **Compliance**: el cambio cumple `changes/<slug>/spec.md` y `plan.md` (archivos, orden, prueba) y los principios de diseño de CLAUDE.md. Si el diff se aparta del plan y `plan.md` no registra el desvío, es un finding.

La profundidad sigue al nivel de riesgo (`sdlc risk`): **Quick** en low (un finder para todos los passes), **Standard** en medium (un finder por pass), **Deep** en high (además **Tests** y **Regressions** en código fuera del diff, y tres votos del verificador).

## Severidad
Cada finding tiene una, un `archivo:línea` y la evidencia que lo prueba:
- **Important**: rompe comportamiento, filtra datos o viola una política. Se arregla antes del merge.
- **Nit**: menor y vale la pena arreglarlo, nunca bloquea. Estilo y naming son Nit.
- **Pre-existing**: un problema real en código que esta PR no tocó. Se lista para que no se pierda, no para bloquear esta PR.

Además, a cada finding ponele una **clase de bug** (off-by-one, falta un chequeo de autorización, error sin manejar…): dice qué buscar en otros lados y alimenta los evals del reviewer.

## Qué significa Important acá
<!-- /sdlc-setup completa los criterios específicos del proyecto -->

## Convergencia
- Como máximo tres rondas por PR (`ci.review.max_rounds`). Después, el reviewer solo revisa si los findings abiertos se arreglaron; el resto lo revisa una persona.
- Desde la segunda ronda, revisá solo los commits desde la ronda anterior.
- Nunca reportes un finding de nuevo, aunque sea con otras palabras. Un finding que sigue ahí sigue abierto; no es uno nuevo.
- El verificador descarta lo que el código no sostiene y lo que es solo estilo.

## Reglas del loop
- En PRs de fix: el test que reproduce el bug no se modifica después de su commit. Si cambió, es Important.
- Cambios en rutas de `risk.high_risk_paths` (.sdlc/config.json): marcá que requieren aprobación de tech lead.
- Si el cambio deja `CLAUDE.md` desactualizado, decilo.

## Limitá los nits
Reportá como máximo cinco nits por review; resumí el resto como un número.

## No reportar
<!-- /sdlc-setup completa: código generado, vendored, lo que CI ya valida (lint, formato) -->
- Lo que CI ya valida (formato, lint).
