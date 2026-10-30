---
name: sdlc-intent
description: Stage 1 (Plan) del loop AI-native. Captura una idea, ticket o incidente como changes/<slug>/intent.md mediante un brainstorming guiado, crea la rama change/<slug> y lo deja listo para la revisión del Product Owner. Usar cuando alguien quiere empezar un cambio nuevo, tiene una idea, trae un ticket de Jira (ej. "/sdlc-intent PROJ-123") o pide "capturar el intent".
argument-hint: "[PROJ-123 | descripción breve de la idea]"
---

# /sdlc-intent — capturar el intent

Objetivo: que la idea quede escrita **una vez, en palabras de quien la tuvo**, como un artefacto versionado que la siguiente etapa puede usar. Nada de backlog grooming: brainstorming hasta que la idea sea concreta.

CLI del loop: `sdlc` ({{sdlc_hint}}). Config del proyecto: `.sdlc/config.json`.

## 0. Prerequisitos
- Si no existe `.sdlc/config.json`, decí que el proyecto no está configurado y ofrecé `/sdlc-setup`. Podés seguir igual, usando el template de abajo y sin integración con Jira.
- Si hay cambios sin commitear en la rama actual, avisá antes de crear una rama nueva.

## 1. Entrada
- **Con ticket** (`$ARGUMENTS` parece una key `ABC-123`) y `tracker.provider = jira`: leé el ticket con el MCP de Atlassian si está disponible en la sesión; si no, con `sdlc tracker get <KEY>`. Usá summary y description como punto de partida. `origin: ticket`.
- **Con texto**: es la descripción inicial de la idea. `origin: idea`.
- **Sin argumentos**: pedile a la persona que describa el problema con sus palabras.
- Si Jira falla (credenciales, red), avisá en una línea y seguí sin Jira: el tracker acompaña, no bloquea.

## 2. Brainstorming
Hacé las preguntas que haría un analista, **de a pocas** (2-3 por turno, con AskUserQuestion cuando haya opciones claras):
- ¿Qué no se puede hacer hoy? ¿A quién afecta y cuánto?
- ¿Cómo se ve "mejor"? ¿Cómo sabemos que funcionó?
- ¿Qué sistemas y usuarios toca?
- ¿Restricciones? (datos/PII, seguridad, compliance, tiempos, tecnología)
- ¿Qué queda explícitamente fuera?
Si el repo tiene código, podés mirarlo para hacer preguntas más precisas, pero **no propongas soluciones técnicas**: eso es Stage 2-3.
Pará cuando el problema, el resultado y las restricciones estén claros. Lo que siga abierto va a "Preguntas abiertas".

## 3. Crear el cambio
1. Slug en kebab-case, corto (`claims-status`). Con ticket: `PROJ-123-claims-status`.
2. Carpeta: con ticket `changes/<KEY>-<slug>/`; sin ticket `changes/<YYYY-MM>-<slug>/`.
3. Rama: `git switch -c change/<slug>` desde la default branch actualizada (`vcs.default_branch`). Con ticket: `change/<KEY>-<slug>`. La key en el nombre de la rama hace que la integración nativa de Jira la linkee sola.
4. Escribí `intent.md` desde `changes/_templates/intent.md` (si no existe en el repo, usá el de `<directorio base>/../sdlc-setup/scaffold/changes/_templates/intent.md`). Frontmatter: `change`, `status: draft`, `author` (nombre de quien originó la idea, no el tuyo), `origin`, `ticket`, `created` (fecha de hoy).
5. Mostrá el intent y pedí correcciones. Iterá hasta que la persona diga que refleja lo que quiso decir.
6. Commit: `intent(<slug>): <título>` (+ ` [KEY]` si hay ticket).

## 4. Jira (si `tracker.provider = jira`)
Según `tracker.mode`:
- **Sin ticket**: en `jira-sot` creá el ticket (obligatorio): `sdlc tracker create --summary "<título>" --body-file changes/<...>/intent.md`. En `linkage` ofrecé crearlo. En `repo-sot` es opcional. Si se crea, renombrá carpeta y rama para incluir la key y actualizá `ticket:`.
- **linkage / repo-sot**: comentá en el ticket el path del intent y el SHA del commit.
- **jira-sot**: escribí el intent en la descripción del ticket (`set-description`) y comentá el SHA.
- Transición `intent` si está mapeada: `sdlc tracker transition <KEY> intent`.

## 5. Gate: Product Owner
- Ofrecé pushear la rama y abrir un **PR/MR borrador** para que el PO revise: armá el body con el contenido del intent y corré `sdlc vcs pr-create --draft --title "[intent] <título>" --body-file <tmp>`.
- El PO acepta cambiando `status: accepted` y completando `approved_by` (puede pedírtelo a vos en una sesión; en ese caso registrá su nombre, no el tuyo). Ese commit es el registro del gate.
- Si lo rechaza: `status: rejected` con el motivo como comentario en el PR, y se cierra.

## 6. Cierre
Terminá con una línea: dónde quedó el intent, el link al PR/ticket si hay, y **el siguiente paso**: "Cuando el PO lo acepte → `/sdlc-spec`".
