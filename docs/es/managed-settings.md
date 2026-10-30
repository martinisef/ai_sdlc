# Managed settings (capa 1: lo no negociable)

Las despliega plataforma o IT, con la consola de admin de Claude o con MDM. Los engineers no pueden editarlas ni pisarlas.

[`managed-settings/example.json`](https://github.com/martinisef/ai_sdlc/blob/main/managed-settings/example.json) es un **punto de partida para adaptar, no para copiar**. Cada `deny` resta capacidad, y el equilibrio correcto depende de cómo estén clasificados los datos del repo.

## Qué compra cada bloque

| Clave | Control |
|---|---|
| `permissions.deny` | Saca secretos del contexto del agente y bloquea el egress de red por herramientas. |
| `permissions.allow` | Pre-aprueba el inner loop seguro para que el deny no se convierta en fatiga de prompts. |
| `disableBypassPermissionsMode` | Nadie puede saltear las reglas por flag. Podés sumar `allowManagedPermissionRulesOnly: true` para que ningún archivo de proyecto amplíe permisos. Ojo: eso anula los `permissions.allow` que `/sdlc-setup` genera por stack; si lo usás, mové esos allow acá. |
| `sandbox` | Cierra lo que los permisos no cubren. Un deny de WebFetch no frena un comando de shell que sale a la red; un allowlist de dominios a nivel OS sí. `failIfUnavailable` junto con `allowUnsandboxedCommands: false` convierten el sandbox en gate. Para denegar la lectura de credenciales también desde comandos de shell sandboxeados, sumá el bloque `sandbox.credentials` del playbook. |
| `allowManagedHooksOnly` | Está en `false` en el ejemplo **a propósito**: los guardrails de `ai-sdlc` son hooks de plugin o de proyecto. Si lo ponés en `true`, distribuí esos hooks también vía managed settings. |
| `strictKnownMarketplaces` | Todo skill, agent, hook y servidor MCP llega desde el marketplace aprobado de la org. En un fork, apuntalo a tu propio repo. |
| `allowManagedMcpServersOnly` | Ponelo en `true` para que la superficie de herramientas sea un allowlist de plataforma; en ese caso declará acá los MCP que necesites (por ejemplo, el de Atlassian). |
| `requiredMinimumVersion` | Claude Code no arranca con versiones por debajo del piso evaluado por la org. |

Referencia de todas las claves, incluidas las managed-only: [code.claude.com/docs/en/settings](https://code.claude.com/docs/en/settings). Verificá cada clave contra esa referencia antes de desplegar, porque algunas dependen de la versión de Claude Code.

## Interacción con `ai-sdlc`

- Los hooks de los guardrails (rutas protegidas, secretos, test-lock, gate de producción) funcionan con `allowManagedHooksOnly: false`.
- El gate de producción de `ai-sdlc` es un control *de proyecto*. Si producción es crítica, replicá el hook en managed settings para que no dependa de la configuración del proyecto ni de que el plugin esté habilitado.
- Cursor y los agentes de AGENTS.md tienen sus propios controles de admin. En todos los casos, los git hooks de `sdlc` y el CI son la red común.
