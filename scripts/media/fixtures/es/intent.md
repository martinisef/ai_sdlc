---
change: marcar-hecha
status: draft            # draft → accepted (Product Owner) | rejected
author: Ana Dev
origin: idea             # idea | ticket | incident | review
ticket:
created: 2026-11-03
approved_by:
---
# Intent: Marcar una tarea como hecha

## Problema
Cuando se agrega una tarea queda en la lista para siempre. No se distingue qué falta hacer.

## Resultado propuesto
`todo done <id>` marca una tarea como hecha; `todo list` muestra las hechas con un tilde.

## Usuarios y sistemas afectados
Quien usa la CLI. El archivo `todos.json` suma un campo `done`.

## Restricciones
Los `todos.json` viejos, sin `done`, tienen que seguir funcionando.

## Cómo sabemos que funcionó
Marcar una tarea como hecha y listar muestra `[x]` al lado.

## Fuera de alcance
Borrar tareas. Deshacer "hecha".

## Preguntas abiertas
- Ninguna.
