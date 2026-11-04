# Uso diario

Un machete para tu propio proyecto. Los comandos de terminal empiezan con `npx sdlc`; los del agente empiezan con `/` y van en su chat.

## El único comando que tenés que recordar

```bash
npx sdlc next
```

Mira en qué etapa está cada cambio y te dice lo único que hay que hacer ahora: aprobar algo, pedirle al agente el próximo paso, mandar el PR o empezar un cambio.

## Quiero…

| Quiero… | Hago… |
|---|---|
| Arreglar un typo, un texto, algo chico | `npx sdlc quick "qué"`, después `/sdlc-quick` |
| Construir una funcionalidad | `npx sdlc new <nombre-corto> --title "Qué"`, después `/sdlc-intent <el problema con mis palabras>` |
| Arrancar desde un ticket de Jira | `/sdlc-intent PROJ-123` (antes [conectá Jira](./jira.md)) |
| Saber qué sigue | `npx sdlc next` |
| Ver todos los cambios y su etapa | `npx sdlc status`, o el Tablero en `npx sdlc ui` |
| Aprobar un documento | `npx sdlc approve <cambio> intent` (o `spec`, `plan`) |
| Decir que no, con un motivo | `npx sdlc reject <cambio> spec -m "R2 no es lo que necesitamos"` |
| Que el agente escriba el próximo documento | `/sdlc-spec`, después `/sdlc-plan` |
| Que el agente escriba el código | `/sdlc-build` (solo con el plan aprobado) |
| Abrir el pull request | `/sdlc-ship`; `/sdlc-ship --babysit` además sigue el review y el CI |
| Arreglar un bug | `/sdlc-fix <qué está mal>`: primero escribe un test que falla, después el arreglo |
| Atender algo que se rompió en producción | `/sdlc-incident <qué pasó>`: triage, un intent nuevo, una lección y un eval |
| Entender un módulo antes de tocarlo | `/sdlc-explain src/<módulo>`: escribe `docs/explainers/<módulo>.md` |
| Un cambio chico creció demasiado | `npx sdlc promote`: lo pasa al loop completo |
| Revisar la configuración | `npx sdlc doctor`; `npx sdlc doctor --fix` arregla lo que puede |
| Usar el dashboard web | `npx sdlc ui` |
| Ver cómo viene el loop | `npx sdlc metrics --funnel` |

## Un día normal

1. Abrí la terminal en tu proyecto y corré `npx sdlc next`.
2. Si dice "Te toca decidir": leé el documento que nombra (en `changes/…` o en el dashboard) y aprobalo o rechazalo.
3. Si dice "Siguiente: /sdlc-…": escribí eso en el chat del agente.
4. Repetí hasta que el pull request esté abierto. Revisalo y mergealo como siempre.

## Reglas que la herramienta cuida por vos

- **Nada de código sin un plan aprobado.** Subir código en una rama de cambio sin plan aprobado se bloquea.
- **Solo las personas aprueban.** Un agente, un bot o (en un equipo) el autor del documento no pueden aprobarlo.
- **Los archivos protegidos siguen protegidos.** El código generado y las migraciones no se editan desde una sesión del agente.
- **Nada de secretos en el código.** Escribir algo que parece una contraseña o una API key se bloquea.
- **Durante un arreglo de bug, los tests quedan bloqueados.** El arreglo tiene que hacer pasar el test existente, no cambiarlo.

Cuando algo se bloquea, el mensaje dice por qué y qué hacer. Mirá [Problemas frecuentes](./problemas.md).

## Trabajar en equipo

Corré `npx sdlc init --locale es --preset team-github` en lugar de `solo`. Pregunta quién es el Product Owner (aprueba intent y spec) y quién el tech lead (aprueba el plan). Todo lo demás queda igual. Más en la [guía para equipos](../guia-equipo.md).
