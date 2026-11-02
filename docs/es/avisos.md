# Avisos

El loop espera a personas: el PO acepta el intent, alguien aprueba la spec y el plan, un code owner mergea. `sdlc notify` avisa cada uno de esos momentos en el canal del equipo, para que nadie tenga que estar mirando el PR.

| Evento | Lo manda | Dice |
|---|---|---|
| `spec.ready` | `sdlc ci intent-to-spec`, después de pushear la spec | la spec está escrita y quién la aprueba |
| `gate.pending` | `sdlc ci gate-status`, cuando el push agrega o cambia el artefacto que espera un gate | qué artefacto espera y quién tiene que decidir |
| `gate.decided` | `sdlc ci gate`, después de un `/approve` o `/reject` en un comentario | la decisión, quién la tomó y el motivo |
| `review.done` | `sdlc ci review`, y `sdlc-review.yml` en GitHub | terminó la revisión; el conteo `Important: N · Nit: M` |
| `change.merged` | `sdlc ci tracker-merged` (el job del PR mergeado) | el cambio está mergeado |

Cada mensaje incluye el cambio, su etapa, a quién le toca (según `gates` y `roles`) y links al PR y al artefacto en la rama.

Los avisos son fail-open: sin webhook no se manda nada, y si el envío falla queda una línea en el log del job, nunca un build roto.

## Slack

1. En Slack, creá una app (**api.slack.com/apps → Create New App → From scratch**), activá **Incoming Webhooks** y hacé **Add New Webhook to Workspace** para el canal.
2. Guardá la URL como secret de CI con el nombre `SDLC_NOTIFY_WEBHOOK` (GitHub: `gh secret set SDLC_NOTIFY_WEBHOOK`; GitLab: variable CI/CD masked; Bitbucket: repository variable secured). Los templates de `sdlc ci install` ya la pasan.
3. Opcional: mapeá personas a su member ID de Slack para que el mensaje las mencione (perfil → ⋮ → **Copy member ID**):

```json
{
  "notify": {
    "format": "slack",
    "events": ["gate.pending", "gate.decided", "change.merged"],
    "people": { "@priya": "U012ABC", "dev@example.com": "U034DEF" }
  }
}
```

Las claves de `people` son las mismas entradas que usás en `roles`: `@login`, email o nombre de git. Sin `format`, una URL de `hooks.slack.com` se manda como Slack y cualquier otra como genérica.

## Teams, Discord y otros webhooks

Usá `"format": "generic"`. El cuerpo es JSON con `text` (lo leen los incoming webhooks de Teams y la mayoría de los chats), `content` (Discord) y los campos estructurados para tu propio servicio: `event`, `title`, `change`, `artifact`, `decision`, `by`, `people` y `links`.

## Desde una terminal u otro pipeline

```bash
sdlc notify gate.pending --change add-login --artifact plan --dry-run   # imprime el payload
SDLC_NOTIFY_WEBHOOK=https://hooks.slack.com/services/… sdlc notify change.merged --change add-login
```

Por defecto el cambio es el de la rama actual (`HEAD_REF` en CI). Con `notify.webhook_env` la URL se lee de otra variable, y con `notify.events` quedan solo los eventos que le importan al canal.
