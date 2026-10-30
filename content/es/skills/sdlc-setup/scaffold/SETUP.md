# Setup del loop AI-native

Estado de adopción de los plays del playbook en este proyecto. `/sdlc-setup` lo actualiza y retoma desde lo pendiente.
Leyenda: ✅ hecho · ⬜ pendiente · ➖ no aplica

| Play | Estado | Notas |
|---|---|---|
| Config base (`.sdlc/config.json`, `settings.json`) | ⬜ | |
| CLAUDE.md (< 1 página, comandos verificados) | ⬜ | |
| Feedback loop (build/test/lint con un comando, verdes) | ⬜ | |
| Guardrails (rutas protegidas, secretos, formato, test-lock) | ⬜ | |
| Gate de producción | ⬜ | |
| Políticas como skills | ⬜ | |
| REVIEW.md + review automático en PR/MR | ⬜ | |
| Tracker (Jira) | ⬜ | |
| Configuración manual del provider (branch protection, secrets) | ⬜ | |
| Evals de configuración en CI | ⬜ | |
| Stage 6: bandas y cierre del loop | ⬜ | Requiere métricas con baseline estable |

## Próximo paso
Correr `/sdlc-intent` para el primer cambio.
