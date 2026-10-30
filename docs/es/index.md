# ai-native-sdlc

El loop del *AI-Native SDLC Playbook* de Anthropic, en tu repo. **intent → spec → plan → build → ship → incident**: los agentes producen cada artefacto y las personas son dueñas de los gates. Funciona con Claude Code, Cursor y cualquier agente que lea `AGENTS.md`.

```bash
npm i -D @ai-native-sdlc/cli
npx sdlc init --locale es       # skills, mensajes de los guardrails y dashboard en español
npx sdlc doctor
```

Después abrí tu agente en el repo y corré `/sdlc-setup`.

## Guías en español
- [El loop en una página (equipos)](./guia-equipo)
- [Guía de plataforma](./guia-plataforma)
- [Managed settings](./managed-settings)

La referencia (CLI, configuración, CI, bandas de control, evals) está en inglés: [Reference](/reference/cli). Con `locale: "es"` en `.sdlc/config.json`, `sdlc sync` genera las skills, los subagents y los mensajes de los hooks en español.
