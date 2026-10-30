---
name: sdlc-incident
description: Stage 6 (Maintain) del loop AI-native. Diagnostica un incidente, alerta o banda rota en modo solo lectura, y cierra el loop escribiéndolo como un nuevo intent.md (origin incident), una lesson en lessons/ y una propuesta de eval; si el fix es chico y acotado, lo deriva a /sdlc-fix. Usar ante una alerta, un incidente, un test que empezó a fallar en CI, o un pedido urgente desde un canal.
argument-hint: "[descripción | PROJ-123 | métrica rota]"
---

# /sdlc-incident — el loop se cierra

Detección determinística, diagnóstico con Claude, acción solo por rutas con gate. Las personas triagean y revisan; no tienen que arrancar el trabajo.

CLI del loop: `sdlc` ({{sdlc_hint}}).

## 1. Diagnóstico (solo lectura)
- **No edites código ni ejecutes acciones con efectos** en esta fase. Leé logs, el diff del último deploy, historial de CI, `lessons/` (incidentes parecidos), y métricas con las herramientas o MCP disponibles.
- Compará la firma del error contra los cambios recientes (`git log` del período, PRs mergeados).
- Resultado: causa probable con **evidencia** y nivel de confianza.

## 2. Acción inmediata (solo con autorización humana)
- Si hay un runbook pre-aprobado (rollback, quarantine de un test flaky) y el impacto lo justifica: **proponelo y esperá un "sí" explícito** antes de ejecutarlo. El gate de producción del plugin bloquea deploys sin autorización.
- Verificá después que la métrica volvió a su banda.

## 3. Cerrar el loop
Elegí la ruta según el tamaño del fix:
- **Chico y acotado** (una causa clara, pocos archivos, testeable): ofrecé seguir con `/sdlc-fix`.
- **Más grande o con decisiones de producto**: escribí `changes/<YYYY-MM>-<slug>/intent.md` desde el template con `origin: incident`: la anomalía y su evidencia, resultado propuesto, sistemas afectados, preguntas abiertas. Rama `change/<slug>`, commit. Entra al loop como cualquier otro intent.

En los dos casos:
1. `lessons/<YYYY-MM-DD>-<slug>.md` con el formato de `lessons/README.md`.
2. Propuesta de eval en `evals/<slug>.json` (prompt + checks) para que la clase de incidente no vuelva a pasar desapercibida.
3. Jira: crear ticket de tipo `tracker.incident_issue_type` linkeado al intent y a la lesson (`sdlc tracker create --type <tipo> ...`). Si falla, avisá y seguí.

## 4. Triage
Dejá claro que el on-call o service owner decide: **fix now / schedule / dismiss**. Los descartes sirven para ajustar las bandas (`ops/bands.yaml`).

## Modo headless (invocado por el detector de bandas)
Sin usuario: solo pasos 1 y 3 (diagnóstico + intent + lesson + propuesta de eval), nunca acciones del paso 2. Terminá con un resumen de 3 líneas para el canal o el PR.
