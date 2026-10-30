# Tracker · Jira

Jira acompaña el loop: **no es un gate**. Si una llamada falla, las skills avisan y siguen.

## Preguntas del setup
1. **URL** del sitio (`https://<org>.atlassian.net` o Data Center) y **project key**.
2. **Modo** (sidebar "Legacy systems and the source of truth" del playbook):
   | Modo | Fuente de verdad | Qué hace el loop |
   |---|---|---|
   | `linkage` (recomendado para arrancar) | las dos, linkeadas | key en rama/carpeta/commits/PR; comentarios con path + SHA; transiciones |
   | `jira-sot` | Jira | además: el intent se escribe en la descripción del ticket, resúmenes de spec/plan como comentario, ticket obligatorio |
   | `repo-sot` | el repo | Jira solo recibe links a los archivos; ticket opcional |
3. **Transiciones**: obtené los estados del proyecto (`sdlc tracker statuses`, o el MCP de Atlassian) y pedí el mapeo para cada etapa: `intent`, `spec`, `plan`, `ship`, `merged`. Se puede mapear al nombre de la transición o al estado destino. Etapas sin mapear: no se transiciona.
4. **Tipos de issue** para cambios (`default_issue_type`, ej. Story/Task) e incidentes (`incident_issue_type`, ej. Bug/Incident).

## Bloque en sdlc.json
```json
"tracker": {
  "provider": "jira", "mode": "linkage",
  "base_url": "https://<org>.atlassian.net", "project_key": "PROJ",
  "default_issue_type": "Task", "incident_issue_type": "Bug",
  "transitions": { "spec": "In Design", "plan": "In Progress", "ship": "In Review", "merged": "Done" }
}
```

## Acceso
- **Sesiones interactivas**: MCP remoto de Atlassian en `.mcp.json` del proyecto (cada persona se autentica con OAuth la primera vez con `/mcp`):
  ```json
  { "mcpServers": { "atlassian": { "type": "sse", "url": "https://mcp.atlassian.com/v1/sse" } } }
  ```
  Verificá la URL y el tipo de transporte vigentes en la documentación de Atlassian al configurarlo. Las skills prefieren el MCP; si no está disponible, usan `sdlc tracker`.
- **CI y fallback local**: `sdlc tracker` con REST. Cloud: `JIRA_EMAIL` + `JIRA_API_TOKEN` (token de una cuenta de servicio con permiso de transicionar y comentar en el proyecto). Data Center: `JIRA_PAT`.
- Nunca guardar tokens en el repo: van como secrets del CI o variables de entorno locales.

## Integración nativa (sin código)
Activá la integración de Jira con el proveedor (GitHub for Jira / GitLab for Jira Cloud / Bitbucket nativo). Con la key en el nombre de rama y en commits/PR, Jira muestra ramas, commits y PRs en el ticket automáticamente.

## Verificación
- `sdlc tracker get <KEY-de-prueba>` devuelve el ticket.
- `sdlc tracker transitions <KEY-de-prueba>` contiene cada transición mapeada (o su estado destino).
