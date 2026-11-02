# Tracker · Linear

Issues de Linear por su API GraphQL. Como todo tracker, **no es un gate**: si una llamada falla, los skills avisan y siguen.

## Preguntas de setup
1. **Team key**: el prefijo de los identificadores (`ENG` en `ENG-123`).
2. **Modo**: `linkage` (recomendado), `jira-sot` (Linear es la fuente de verdad: el intent va a la descripción del issue) o `repo-sot` (Linear solo recibe links). El nombre del modo es el mismo para todos los trackers.
3. **Transiciones**: listá los estados del workflow del equipo (`sdlc tracker statuses`) y preguntá a cuál va cada etapa: `intent`, `spec`, `plan`, `ship`, `merged`. Etapas sin mapear: sin transición.

## Bloque en sdlc.json
```json
"tracker": {
  "provider": "linear", "mode": "linkage", "team_key": "ENG",
  "transitions": { "spec": "In Design", "plan": "In Progress", "ship": "In Review", "merged": "Done" }
}
```

## Acceso
- **API key**: Linear → Settings → Security & access → Personal API keys (para CI, la key de un miembro de servicio con acceso al equipo). Exportala como `LINEAR_API_KEY` en local; en CI, guardala como secret con ese nombre (los templates la pasan).
- Nunca guardes la key en el repo.
- **Sesiones interactivas**: si el equipo usa el MCP server de Linear, los skills pueden usarlo; `sdlc tracker` es el fallback y lo que usa CI.

## Integración nativa (sin código)
La integración de Linear con GitHub/GitLab vincula ramas y PRs que tengan el identificador (`change/ENG-123-…`) y puede mover el issue sola. Si activás sus automatizaciones, no mapees las mismas etapas en `transitions`, o las dos van a mover el issue.

## Verificación
- `sdlc tracker get ENG-<n>` devuelve un issue de prueba.
- `sdlc tracker statuses` lista todos los estados usados en `transitions`.
