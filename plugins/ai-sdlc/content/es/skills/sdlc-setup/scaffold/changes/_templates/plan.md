---
change: <slug>
status: draft            # draft → approved (engineer; tech lead si risk: high)
spec: ./spec.md
ticket:
risk: routine            # routine | high
approved_by:
---
# Plan: <título> (desde spec.md <fecha>)

## Archivos que cambian
- `<ruta>` (nuevo | modificado): <para qué>

## Orden de trabajo
1. <paso chico y verificable>
2.

## Explainers
<!-- `sdlc explainers <rutas>`: los explainers de módulo en los que se apoya este plan, y los invariantes que toca. -->
- `docs/explainers/<módulo>.md`: <invariante que el cambio toca> (o: ninguno)

## Riesgos
- <qué puede romper y cómo se mitiga>

## Prueba
<!-- Una línea por requerimiento de spec.md: `sdlc trace` revisa que cada R esté acá, y el gate del plan rechaza un plan que se saltea uno. Sirven rangos: `R3–R5`. -->
- R1: <test o check que lo demuestra, con el comando exacto. Ej.: `tests/test_notes.py` cubre los 4 estados (`make test`)>
- Además: <checks que no son de un requerimiento: lint limpio, screenshot coincide con el mock aprobado>

## Alternativas descartadas
- <opción> — <por qué no>

## Desvíos durante la implementación
<!-- Se completa en /sdlc-build si la implementación se aparta del plan, en el mismo commit. -->
