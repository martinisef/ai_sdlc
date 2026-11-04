# Conectar Jira

Opcional, unos 10 minutos. Una vez conectado, cada cambio del loop queda vinculado a su ticket de Jira y el ticket avanza solo a medida que avanza el cambio:

| Cuando… | Jira… |
|---|---|
| empezás un cambio desde un ticket (`/sdlc-intent PROJ-123`) | el agente lee el ticket y arranca desde su título y su descripción |
| se escribe el intent, la spec o el plan | recibe un comentario con la ruta del archivo y el commit, y el ticket pasa al estado que elegiste para esa etapa |
| se abre el pull request (`/sdlc-ship`) | recibe el link al pull request y pasa a tu estado de "en revisión" |
| se mergea el pull request | pasa a "Done" (con el CI configurado, ver [En CI](#en-ci)) |

Jira nunca te bloquea. Si una llamada falla (token equivocado, Jira caído, un estado que no existe), la herramienta muestra un aviso y el loop sigue.

¿Preferís que lo haga el agente? Escribí `/sdlc-setup` en el chat del agente y decile que querés conectar Jira; te hace las mismas preguntas que esta página. Después volvé al [paso 4](#paso-4-comprobalo) para comprobarlo.

## Qué necesitás

- El proyecto ya configurado ([Instalar](./instalar.md)).
- La dirección de tu Jira, por ejemplo `https://tu-empresa.atlassian.net`.
- La **clave del proyecto**: las letras antes del número en tus tickets. En `PROJ-123` es `PROJ`.
- Permiso para comentar y mover tickets en ese proyecto. Si lo podés hacer desde el navegador, alcanza.

## Paso 1: Creá un token de API

La herramienta habla con Jira con un token, nunca con tu contraseña.

- **Jira Cloud** (la dirección termina en `atlassian.net`): entrá a [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens), hacé clic en **Create API token**, ponele un nombre como `ai-sdlc` y copialo. Atlassian lo muestra una sola vez.
- **Jira Data Center o Server** (Jira instalado por tu empresa): en Jira, hacé clic en tu avatar → **Perfil** → **Personal Access Tokens** → **Create token**, y copialo.

## Paso 2: Guardalo en tu computadora

El token va en el entorno de tu computadora, **nunca en el proyecto**: todo lo que está en el repo lo ve cualquiera que tenga acceso.

Abrí el archivo de configuración de tu terminal en un editor: `nano ~/.zshrc` en macOS, `nano ~/.bashrc` en Linux o Windows (WSL). Agregá estas líneas al final, con tus datos:

```bash
# Jira Cloud
export JIRA_EMAIL="vos@tu-empresa.com"
export JIRA_API_TOKEN="pegá-el-token-acá"

# Jira Data Center o Server: esta línea en lugar de las dos de arriba
# export JIRA_PAT="pegá-el-token-acá"
```

Guardá (en nano: `Ctrl+O`, Enter, `Ctrl+X`), cerrá la terminal y abrí una nueva para que tome el cambio.

## Paso 3: Configuralo en el proyecto

Abrí `.sdlc/config.json` en tu proyecto. Tiene un bloque `"tracker"` que dice `"provider": "none"`. Reemplazá el bloque entero por este, cambiando la dirección y la clave del proyecto:

```json
"tracker": {
  "provider": "jira",
  "mode": "linkage",
  "base_url": "https://tu-empresa.atlassian.net",
  "project_key": "PROJ",
  "default_issue_type": "Task",
  "incident_issue_type": "Bug",
  "transitions": { "spec": "In Design", "plan": "In Progress", "ship": "In Review", "merged": "Done" }
}
```

| Campo | Qué poner |
|---|---|
| `base_url` | La dirección de tu Jira, sin nada después de `.net` (o después del nombre de tu servidor) |
| `project_key` | Las letras de tus tickets: `PROJ` para `PROJ-123` |
| `mode` | Dejá `linkage`: los documentos viven en el repo y el ticket los linkea. Los otros modos están en [Trackers](../integraciones/trackers.md) |
| `default_issue_type`, `incident_issue_type` | El tipo de ticket que se usa cuando la herramienta crea uno para un cambio o para un incidente |
| `transitions` | A qué estado de Jira mueve el ticket cada etapa (sección siguiente) |

El dashboard (`npx sdlc ui` → Settings → Tracker) también edita el proveedor, el modo, la dirección y la clave. Las transiciones se editan en el archivo.

### Asigná un estado de Jira a cada etapa

Cada proyecto de Jira nombra sus estados distinto. Pedile a la herramienta los tuyos:

```bash
npx sdlc tracker statuses
```

```text
Done
In Design
In Progress
In Review
To Do
```

Después elegí uno para cada etapa: `spec` (se escribió la spec), `plan` (se escribió el plan), `ship` (se abrió el pull request) y `merged`. Una etapa que no pongas no mueve el ticket. Podés escribir el nombre del estado, como arriba, o el nombre del botón de transición en Jira.

Guardá el archivo y commitealo. No tiene secretos:

```bash
git add .sdlc/config.json && git commit -m "chore: conectar Jira"
```

## Paso 4: Comprobalo

Usá cualquier ticket de tu proyecto:

```bash
npx sdlc tracker get PROJ-1
```

```text
{"key":"PROJ-1","summary":"Mark a to-do as done","status":"To Do","type":"Story","description":null,"url":"https://tu-empresa.atlassian.net/browse/PROJ-1"}
```

Si ves el título del ticket, la conexión funciona. Para revisar las etapas, listá a dónde puede pasar ese ticket desde su estado actual:

```bash
npx sdlc tracker transitions PROJ-1
```

```text
In Design	→ In Design
In Progress	→ In Progress
In Review	→ In Review
Done	→ Done
```

Cada estado que pusiste en `transitions` debería aparecer a la derecha. Si en cambio ves un error, mirá [Si algo falla](#si-algo-falla).

## Paso 5: Usalo

Empezá un cambio desde un ticket pasándole la clave al agente:

```text
/sdlc-intent PROJ-123
```

El agente lee el ticket, escribe el intent a partir de él y nombra la carpeta y la rama con la clave (`change/PROJ-123-…`). Desde ahí el loop es igual que en el [tutorial](./tutorial.md): cada paso comenta en el ticket y lo mueve. Para mover un ticket a mano, por ejemplo después de mergear sin CI:

```bash
npx sdlc tracker transition PROJ-123 merged
```

```text
PROJ-123 → Done
```

Sin ticket, `/sdlc-intent` ofrece crear uno.

## Opcional: Jira dentro del chat del agente

Con Claude Code, el agente también puede leer Jira directamente con el servidor MCP de Atlassian, que le permite buscar tickets y leer comentarios. Creá `.mcp.json` en la raíz del proyecto:

```json
{ "mcpServers": { "atlassian": { "type": "sse", "url": "https://mcp.atlassian.com/v1/sse" } } }
```

La primera vez, escribí `/mcp` en Claude Code e iniciá sesión con tu cuenta de Atlassian. Cada persona entra con su propia cuenta; el archivo no tiene tokens, así que se puede commitear. Verificá la dirección vigente en la documentación de Atlassian. Cuando el MCP no está disponible, las skills usan `npx sdlc tracker` y el token del paso 2.

## Opcional: commits y pull requests en el ticket

Jira puede mostrar las ramas, los commits y los pull requests de cada ticket. Para eso hace falta la integración de Jira con tu servidor de git: **GitHub for Jira**, **GitLab for Jira Cloud** o Bitbucket (ya viene incluida). Alguien con permisos de administrador la activa una vez en Jira. La herramienta ya pone la clave del ticket en el nombre de la rama, en los commits y en el título del pull request, que es lo que esa integración busca.

## En CI

Para que el ticket pase a "Done" cuando se mergea el pull request, el CI necesita las mismas credenciales. Agregá `JIRA_EMAIL` y `JIRA_API_TOKEN` (o `JIRA_PAT`) como secretos: en GitHub, Settings → Secrets and variables → Actions; en GitLab, Settings → CI/CD → Variables (masked); en Bitbucket, Repository variables (secured). Usá una cuenta de servicio con permiso para comentar y mover tickets, no tu token personal. Las páginas de CI de [GitHub](../integraciones/ci-github.md), [GitLab](../integraciones/ci-gitlab.md) y [Bitbucket](../integraciones/ci-bitbucket.md) tienen el resto.

## Si algo falla

| Ves | Qué significa | Cómo se arregla |
|---|---|---|
| `tracker not configured (tracker.provider: jira \| github \| linear)` | `.sdlc/config.json` todavía dice `"provider": "none"` | Hacé el [paso 3](#paso-3-configuralo-en-el-proyecto) |
| `missing Jira credentials (JIRA_EMAIL + JIRA_API_TOKEN, or JIRA_PAT)` | La terminal no ve el token | Hacé el [paso 2](#paso-2-guardalo-en-tu-computadora) y abrí una terminal nueva. `echo $JIRA_EMAIL` debería mostrar tu email |
| `HTTP 401` | Jira rechazó el token | Revisá que el email sea el de tu cuenta de Atlassian y creá un token nuevo. En Data Center, usá `JIRA_PAT` |
| `HTTP 404` | El ticket no existe o no lo podés ver | Revisá la clave y que puedas abrir el ticket en el navegador |
| `transition 'In Design' is not available for PROJ-1 from its current status` | Tu flujo de Jira no permite ese movimiento desde donde está el ticket ahora | Corré `npx sdlc tracker transitions PROJ-1` y elegí un estado que aparezca ahí |
| `fetch failed` | La herramienta no llega a Jira | Revisá `base_url`, y la VPN si tu Jira es interno |
