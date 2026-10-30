---
name: sdlc-ship
description: Stage 5 (Deploy) del loop AI-native. Hace los pre-checks, abre o actualiza el PR/MR (GitHub, GitLab o Bitbucket) linkeando intent/spec/plan y el ticket, y con --babysit atiende comentarios de review y checks rojos hasta dejarlo listo para la aprobación del code owner. Usar cuando un cambio está implementado y hay que abrir el PR, o para "cuidar" un PR abierto.
argument-hint: "[--babysit]"
---

# /sdlc-ship — PR listo para el gate humano

El agente hace todo hasta el gate y nada más allá: **no aprueba ni mergea**. La aprobación es de un code owner vía branch protection.

CLI del loop: `sdlc` ({{sdlc_hint}}). Proveedor: `sdlc vcs provider`.

## 1. Pre-checks (todos obligatorios)
- Build, test y lint de `.sdlc/config.json → commands` en verde. Guardá la salida.
- `plan.md` existe y está `approved`; si el diff se aparta del plan, los desvíos están registrados.
- No hay `.sdlc/fix-lock` pendiente.
- Rama pusheada (`git push -u origin HEAD`).
Si algo falla, arreglalo o reportalo; no abras un PR rojo.

## 2. Abrir o actualizar el PR/MR
1. `sdlc vcs pr-current` → si ya hay uno abierto (por ejemplo el borrador del intent), actualizalo; si no, crealo.
2. Body (archivo temporal):
   ```
   ## Qué y por qué
   <resumen desde intent/spec>
   ## Artefactos
   - Intent: changes/<slug>/intent.md · Spec: …/spec.md · Plan: …/plan.md
   - Ticket: <KEY + link> (si hay)
   ## Desvíos del plan
   <ninguno | lista>
   ## Verificación
   <salida resumida de build/test/lint + veredicto del verifier>
   ## Riesgo
   <routine | high → requiere tech lead>
   ```
3. Título: `<KEY> <título>` si hay ticket (Jira lo linkea), si no `<título>`.
4. `sdlc vcs pr-create --title "<título>" --body-file <tmp>` (o editá el existente con la CLI del proveedor). Mostrá el link.
5. Jira: transición `ship` + comentario con el link al PR. Si falla, avisá y seguí.

## 3. Modo --babysit
Loop hasta que el PR esté verde y solo espere aprobación humana (máximo ~5 iteraciones; después reportá qué queda):
1. `sdlc vcs pr-checks <n>` → si hay checks rojos, leé los logs, arreglá, corré tests local, commit + push.
2. `sdlc vcs pr-comments <n>` → para cada comentario no resuelto: si es un cambio claro, aplicalo; si es una decisión (diseño, alcance), **no la tomes vos**: respondé en el PR resumiendo opciones y dejala para el humano.
3. Respondé en el PR qué se atendió (`pr-comment`).
4. Si un review marca el mismo error por segunda vez, agregá la corrección a `CLAUDE.md` → "Cosas que Claude hace mal" en el mismo PR.

## Cierre
Link al PR, estado de checks, comentarios pendientes de decisión humana, y quién tiene que aprobar (code owner; tech lead si `risk: high`). Después del merge, el pipeline transiciona el ticket a *Done*.
