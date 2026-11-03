---
change: marcar-hecha
status: draft            # draft → approved (engineer; tech lead si risk: high)
spec: ./spec.md
ticket:
risk: routine
approved_by:
---
# Plan: Marcar una tarea como hecha (desde spec.md 2026-11-03)

## Archivos que cambian
- `src/todos.js` (modificado): `done()` y la casilla en `format()`.
- `src/cli.js` (modificado): el comando `done <id>`.
- `test/todos.test.js` (modificado): tests de R1 a R4.

## Orden de trabajo
1. Tests de R1 a R4 (fallan).
2. `done()` y `format()` hasta que pasen.
3. El comando `done` en la CLI.

## Explainers
- ninguno

## Riesgos
- Archivos viejos sin `done`: R4 tiene su propio test.

## Prueba
`npm test` cubre R1 a R4; `npm run lint`.

## Alternativas descartadas
- Un archivo `done.json` aparte: dos archivos que mantener sincronizados.

## Desvíos durante la implementación
