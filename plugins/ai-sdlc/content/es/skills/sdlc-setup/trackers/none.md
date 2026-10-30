# Tracker · ninguno

El repo es la única fuente de verdad: `changes/<YYYY-MM>-<slug>/` con intent, spec y plan.

```json
"tracker": { "provider": "none" }
```

- Las skills no intentan llamar a ningún tracker.
- Ramas: `change/<slug>`. Carpetas con prefijo de fecha.
- Si más adelante se suma Jira: correr `/sdlc-setup --only tracker`. Los cambios existentes pueden linkearse completando `ticket:` en su `intent.md`.
