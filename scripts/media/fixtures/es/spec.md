---
change: marcar-hecha
status: draft            # draft → approved (Product Owner, con los concerns resueltos)
intent: ./intent.md
ticket:
skills_applied: []
risk: routine
approved_by:
---
# Spec: Marcar una tarea como hecha

## Resumen
Un comando nuevo `done <id>` pone `done: true` en una tarea. `list` imprime `[x]` para las hechas y `[ ]` para el resto.

## Requerimientos
- R1: `done(todos, id)` devuelve la lista con esa tarea en `done: true`.
- R2: `done` con un id que no existe tira "no to-do with id <id>".
- R3: `format` imprime `1. [x] comprar leche` para una tarea hecha y `2. [ ] llamar a mamá` si no.
- R4: una tarea sin campo `done` (archivos viejos) cuenta como no hecha.

## Requerimientos no funcionales
Sin dependencias nuevas.

## Diseño
`src/todos.js` suma `done()`; `format()` agrega la casilla. `src/cli.js` suma el comando `done`.

## Políticas aplicadas
| Política (skill) | Cómo se aplicó |
|---|---|
| ninguna | — |

## Áreas de preocupación
| # | Concern | Política / motivo | Owner | Resolución |
|---|---|---|---|---|
| C1 | `todos.json` viejos | compatibilidad | Ana Dev | R4: sin `done` es no hecha |

## Preguntas abiertas del intent
| Pregunta | Estado (respondida / arrastrada) | Respuesta |
|---|---|---|

## Fuera de alcance
Borrar y deshacer.
