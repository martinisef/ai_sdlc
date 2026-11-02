# Tracker · GitHub Issues

Issues en el mismo repositorio que el código (u otro, con `tracker.repo`). Como todo tracker, **no es un gate**: si una llamada falla, los skills avisan y siguen.

## Cómo se mapea el loop a issues
- **Etapa = label.** Cada etapa tiene un label, por defecto `sdlc:intent`, `sdlc:spec`, `sdlc:plan`, `sdlc:ship` y `sdlc:merged`. Una transición saca el label de la etapa anterior y pone el nuevo.
- **`merged` cierra el issue** (como completado), desde `sdlc ci tracker-merged` cuando se mergea el PR.
- **Claves**: `#123`, u `owner/repo#123` para otro repositorio. El sufijo `(#45)` del squash es el número del PR y se ignora. Poné el issue en el intent (`ticket: "#123"`) o en la rama (`change/issue-123-…`).

## Preguntas de setup
1. ¿Mismo repositorio que el código, o uno aparte (`tracker.repo: "owner/repo"`)?
2. **Modo**: `linkage` (recomendado: issue y repo vinculados), `jira-sot` (el issue es la fuente de verdad: el intent va a su cuerpo) o `repo-sot` (el issue solo recibe links).
3. Nombres de labels, si el equipo ya tiene los suyos (`transitions`). GitHub crea el label la primera vez que se aplica.
4. Label para cambios nuevos creados por `/sdlc-intent` (`default_issue_type`, por ejemplo `enhancement`) y para incidentes (`incident_issue_type`, por ejemplo `bug`).

## Bloque en sdlc.json
```json
"tracker": {
  "provider": "github", "mode": "linkage",
  "default_issue_type": "enhancement", "incident_issue_type": "bug",
  "transitions": { "spec": "sdlc:spec", "plan": "sdlc:plan", "ship": "in review", "merged": "sdlc:merged" }
}
```

## Acceso
- **Sesiones interactivas**: con `gh auth login` alcanza para el agente; `sdlc tracker` lee `GH_TOKEN` (o `GITHUB_TOKEN`), así que exportá uno en local (`export GH_TOKEN=$(gh auth token)`).
- **CI**: el job de merge de `sdlc-loop.yml` pasa el `github.token` del workflow como `GH_TOKEN`, con `issues: write`. No hay que crear nada.
- GitHub Enterprise Server: definí `GITHUB_API_URL` (Actions ya la define).

## Verificación
- `sdlc tracker get "#<n>"` devuelve un issue de prueba.
- `sdlc tracker transition "#<n>" spec` pone el label de spec y saca el de la etapa anterior.
