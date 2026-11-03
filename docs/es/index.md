# ai-native-sdlc

El loop del *AI-Native SDLC Playbook* de Anthropic, en tu repo. **intent → spec → plan → build → ship → incident**: los agentes producen cada artefacto y las personas son dueñas de los gates. Funciona con Claude Code, Cursor y cualquier agente que lea `AGENTS.md`.

```bash
npm i -D @morsadev/sdlc
npx sdlc init --locale es --preset team-github   # o solo, o regulated: config, agentes, git hooks y CI en un paso
npx sdlc next                                     # lo único que hay que hacer ahora, siempre
```

¿Cambio chico? `npx sdlc quick "<qué>"` y `/sdlc-quick` en tu agente. ¿Algo no anda? `npx sdlc doctor --fix`.

**¿Primera vez?** [Empezá acá](./empezar/que-es): qué es, cómo instalarlo paso a paso, un tutorial con una app de ejemplo y un video de tres minutos.

## Guías en español
- [Empezá acá](./empezar/que-es)
- [Tu primer cambio en 10 minutos](./primer-cambio)
- [El loop en una página (equipos)](./guia-equipo)
- [Guía de plataforma](./guia-plataforma)
- [Managed settings](./managed-settings)

La referencia (CLI, configuración, CI, bandas de control, evals) está en inglés: [Reference](/reference/cli). Con `locale: "es"` en `.sdlc/config.json`, `sdlc sync` genera las skills, los subagents y los mensajes de los hooks en español.
