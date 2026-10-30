---
name: sdlc-spec
description: Stage 2 (Design) del loop AI-native. Toma un intent.md aceptado y produce spec.md (requerimientos + diseño) aplicando las skills de política de la organización y marcando las áreas de preocupación. Usar cuando un intent fue aceptado, cuando piden "generar la spec", o cuando corre headless en CI tras aceptar un intent.
argument-hint: "[changes/<slug> | slug]  (por defecto, el cambio de la rama actual)"
---

# /sdlc-spec — requirements y design en una sesión

Objetivo: una spec contra la que ingeniería pueda planificar, con las políticas **aplicadas mientras se escribe** (no descubiertas en un review semanas después) y los concerns marcados. El PO la revisa, no la escribe.

CLI del loop: `sdlc` ({{sdlc_hint}}).

## 0. Prerequisitos
1. Ubicá el cambio: `$ARGUMENTS`, o el de la rama actual (`change/<slug>` → `changes/*<slug>/`). Si no hay, mostrá `sdlc status` y preguntá cuál.
2. `intent.md` tiene que tener `status: accepted`. Si está en `draft`, frenar: "el intent todavía no fue aceptado por el PO". No hay excepciones: es el gate de Stage 1.
3. Si ya existe `spec.md`, preguntá si se itera sobre la existente o se regenera.

## 1. Contexto
- Leé `intent.md` completo, `CLAUDE.md` y la arquitectura relevante del código (usá el subagent `researcher` si el repo es grande, para no llenar el contexto).
- Identificá **qué skills de política aplican** (seguridad de APIs, brand, compliance, UX, datos): las que el proyecto tiene disponibles y cuya descripción matchea el cambio. Cargalas y aplicalas.
- Si hay ticket y Jira, leé comentarios recientes del ticket por si hay contexto nuevo.

## 2. Escribir spec.md
Desde `changes/_templates/spec.md`. Reglas:
- Requerimientos numerados (R1, R2…) y **verificables**.
- El diseño referencia el código existente que se reutiliza; no inventes componentes que ya existen.
- Tabla "Políticas aplicadas": qué skill y cómo se aplicó. Completá `skills_applied` en el frontmatter.
- **Áreas de preocupación**: todo lo que un analista habría escalado. En especial cuando dos políticas se contradicen o cuando el intent pide algo que una política no permite. No resuelvas vos un conflicto de políticas: describilo y nombrá al owner.
- Cada pregunta abierta del intent: respondida (con la respuesta) o arrastrada explícitamente.
- `risk: high` si el diseño toca rutas de `risk.high_risk_paths` de `.sdlc/config.json` o cambia auth, datos sensibles o contratos públicos.

## 3. Revisión adversarial
Antes de mostrarla, corré el subagent `spec-reviewer` sobre intent.md + spec.md. Incorporá lo que encuentre (o agregalo como concern si no se puede resolver).

## 4. Commit y Jira
- Commit: `spec(<slug>): <título>` (+ key). `status: draft`.
- Jira según `tracker.mode`: transición `spec` (`sdlc tracker transition <KEY> spec`); comentario con path + SHA; en `jira-sot` además un resumen de la spec y los concerns como comentario. Si falla, avisá y seguí.

## 5. Gate: Product Owner (+ tech lead si `risk: high`)
Indicá al PO qué revisar, en este orden:
1. Las **áreas de preocupación** primero: cada una se resuelve con su policy owner antes de que ingeniería vea la spec.
2. ¿La spec resuelve el problema del intent? ¿Las preguntas abiertas están respondidas o arrastradas?
Aprobación: `status: approved` + `approved_by`. Si es `risk: high`, también un tech lead.

## Modo headless (CI)
Si corrés con `claude -p` (sin usuario): no hagas preguntas; escribí la spec, dejá todo lo dudoso como concern, commiteá y terminá. El pipeline abre/actualiza el PR.

## Cierre
Una línea: spec escrita, cantidad de concerns abiertos, link al PR/ticket, y **siguiente paso**: "Cuando el PO la apruebe → `/sdlc-plan`".
