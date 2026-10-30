# changes/

Un cambio = una carpeta = una rama = un PR/MR.

```
changes/<YYYY-MM>-<slug>/      (o changes/<PROJ-123>-<slug>/ si hay Jira)
  intent.md   ← Stage 1 · /sdlc-intent · gate: Product Owner (status: accepted)
  spec.md     ← Stage 2 · /sdlc-spec   · gate: PO + policy owners (status: approved)
  plan.md     ← Stage 3 · /sdlc-plan   · gate: engineer / tech lead (status: approved)
```

- Rama: `change/<slug>` (con Jira: `change/PROJ-123-<slug>`). Los hooks y `/sdlc-status` deducen el cambio activo de la rama.
- Cada gate queda registrado en git: el commit que cambia `status` y completa `approved_by`.
- La cadena intent → spec → plan → diff → PR es el audit trail.
- Templates en `_templates/`. No los edites por cambio: se copian.
