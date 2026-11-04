# ai-native-sdlc

El loop del *AI-Native SDLC Playbook* de Anthropic, en tu repo. **intent → spec → plan → build → ship → incident**: los agentes producen cada artefacto y las personas son dueñas de los gates. Funciona con Claude Code, Cursor y cualquier agente que lea `AGENTS.md`.

```bash
npm i -D @morsadev/sdlc
npx sdlc init --locale es --preset team-github   # o solo, o regulated: config, agentes, git hooks y CI en un paso
npx sdlc next                                     # lo único que hay que hacer ahora, siempre
```

¿Cambio chico? `npx sdlc quick "<qué>"` y `/sdlc-quick` en tu agente. ¿Algo no anda? `npx sdlc doctor --fix`.

**¿Primera vez?** [Empezá acá](./empezar/que-es.md): qué es, cómo instalarlo paso a paso, un tutorial con una app de ejemplo y un video de tres minutos.

## Guías en español
- [Empezá acá](./empezar/que-es.md)
- [Tu primer cambio en 10 minutos](./primer-cambio.md)
- [El loop en una página (equipos)](./guia-equipo.md)
- [Guía de plataforma](./guia-plataforma.md)
- [Managed settings](./managed-settings.md)
- [Conectar Jira](./empezar/jira.md)
- Integraciones: [trackers (Jira, GitHub Issues, Linear)](./integraciones/trackers.md), CI en [GitHub](./integraciones/ci-github.md), [GitLab](./integraciones/ci-gitlab.md) y [Bitbucket](./integraciones/ci-bitbucket.md)

El resto de la referencia (CLI, configuración, bandas de control, evals) está en inglés: [Reference](../reference/cli.md). Con `locale: "es"` en `.sdlc/config.json`, `sdlc sync` genera las skills, los subagents y los mensajes de los hooks en español.
