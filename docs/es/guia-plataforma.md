# Guía de plataforma

Cómo un equipo de plataforma publica, distribuye y mantiene el loop para la organización.

## 1. Canales de distribución

| Canal | Para | Cómo |
|---|---|---|
| npm: `@ai-native-sdlc/cli` | todos los agentes, CI | `npm i -D @ai-native-sdlc/cli`. Los templates de CI usan `npx -y @ai-native-sdlc/cli@0 ci <cmd>`. |
| Marketplace de Claude Code: plugin `ai-sdlc` | quienes usan Claude Code | skills, subagents y hooks, con el CLI empaquetado en el `bin/` del plugin |
| Archivos del proyecto (`sdlc sync`) | todos los agentes | skills y hooks commiteados en cada repo; no hace falta el plugin |

## 2. Publicar un marketplace propio (opcional)

Para un catálogo propio (tus políticas, stacks y templates), hacé un fork de este repo.

1. Reemplazá `martinisef/ai_sdlc` por tu repo en:
   - `content/*/skills/sdlc-setup/reference/defaults.json` (los defaults que escribe `/sdlc-setup`);
   - `managed-settings/example.json` (`strictKnownMarketplaces`).
2. Generá el plugin (para un marketplace en español, `npm run build:plugin -- --locale es` después de `npm run build`) y validá:
   ```bash
   npm ci && npm run build          # regenera plugins/ai-sdlc y .claude-plugin/marketplace.json
   npm run check:plugin             # claude plugin validate del plugin y del marketplace
   ```
3. Commiteá `plugins/ai-sdlc`. Es generado, y el CI falla si quedó desactualizado.
4. En cada proyecto, poné `plugin.marketplace_repo` en `.sdlc/config.json`. Entonces `sdlc sync` habilita el plugin en `.claude/settings.json` en lugar de copiar las skills.

Los releases usan [changesets](https://github.com/changesets/changesets):

1. Corré `npx changeset` en cada PR que cambie comportamiento.
2. En `main`, el workflow de release abre un PR "Version packages". Ese PR sube la versión de `@ai-native-sdlc/cli` y regenera el plugin y `marketplace.json` con la misma versión.
3. Al mergearlo, se publica en npm con provenance.

## 3. Instalarlo

- **Por persona**: `/plugin marketplace add <org>/ai-native-sdlc`, y después `/plugin install ai-sdlc@ai-native-sdlc`.
- **Por proyecto**: `.claude/settings.json` con `extraKnownMarketplaces` y `enabledPlugins`, que escribe `sdlc sync` cuando hay `plugin.marketplace_repo`. Al abrir el repo, Claude Code ofrece instalarlo.
- **Probar cambios sin instalar**: `claude --plugin-dir ./plugins/ai-sdlc`. Si usás `-p`, pasá el prompt por stdin, porque `--plugin-dir` acepta varios valores.

## 4. Managed settings

Ver [Managed settings](./managed-settings). Se despliegan con la consola de admin o MDM.

## 5. Mantener el catálogo

| Qué | Dónde | Owner |
|---|---|---|
| Decisiones por stack | `content/<locale>/skills/sdlc-setup/stacks/<lang>.md` | plataforma |
| CI por proveedor | `content/<locale>/skills/sdlc-setup/ci/` | plataforma |
| Políticas como skills | `content/<locale>/skills/policy-<nombre>/SKILL.md` (una carpeta por política) | el owner de cada política aprueba el PR |
| Templates de artefactos | `content/<locale>/skills/sdlc-setup/scaffold/changes/_templates/` | plataforma + producto |
| Guardrails | `packages/core/src/policies.ts`, `sdlc hook` | plataforma |

`content/en` es la fuente y `content/es` es su espejo. Mantenelos alineados en el mismo PR.

**Una política nueva.** Copiá `policy-secure-api/` y escribila desde la fuente de verdad del owner. La descripción tiene que decir **cuándo** aplicarla, porque de eso depende que se active. Si la política se tiene que cumplir siempre, sumale además un control determinístico: un hook, un test o un pass en `REVIEW.md`.

**Un stack nuevo.** Cuando un equipo use `_unknown.md`, su `SETUP.md` trae un borrador de `stacks/<lang>.md`. Revisalo y sumalo.

## 6. Calidad de este repo

```bash
npm test                    # core, adapters, CLI (vcs, tracker, ci, bands) y estructura de los evals de producto
npm run test:bash           # paridad de guardrails (payloads de Claude Code)
npm run e2e                 # ciclo + hooks + git hooks sobre una copia de examples/python-api; claude -p real si está disponible
npm run check:pack          # npm pack + install + init + doctor en un proyecto descartable
```

Los evals de producto (`evals/`) corren semanalmente (`.github/workflows/evals.yml`). Le dan al agente tareas reales sobre `examples/` y verifican el resultado.
