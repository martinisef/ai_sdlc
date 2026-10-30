# Instrucciones de review

## Passes
Corré tres passes y etiquetá cada finding con su pass:
- **Bugs**: errores de lógica, edge cases rotos, regresiones sutiles.
- **Security**: inyección, huecos de autenticación/autorización, PII en logs o errores, secretos.
- **Compliance**: el cambio cumple `changes/<slug>/spec.md` y `plan.md` (archivos, orden, prueba) y los principios de diseño de CLAUDE.md. Si el diff se aparta del plan y `plan.md` no registra el desvío, es un finding.

## Qué significa Important acá
Reservá **Important** para findings que rompen comportamiento, filtran datos o violan una política.
Estilo y naming son **Nit**.
<!-- /sdlc-setup completa los criterios específicos del proyecto -->

## Reglas del loop
- En PRs de fix: el test que reproduce el bug no se modifica después de su commit. Si cambió, es Important.
- Cambios en rutas de `risk.high_risk_paths` (.sdlc/config.json): marcá que requieren aprobación de tech lead.
- Si el cambio deja `CLAUDE.md` desactualizado, decilo.

## Limitá los nits
Reportá como máximo cinco nits por review; resumí el resto como un número.

## No reportar
<!-- /sdlc-setup completa: código generado, vendored, lo que CI ya valida (lint, formato) -->
- Lo que CI ya valida (formato, lint).
