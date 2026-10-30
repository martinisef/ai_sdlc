# lessons/

Post-mortems y aprendizajes de incidentes, uno por archivo: `<YYYY-MM-DD>-<slug>.md`.
Los escribe `/sdlc-incident` y Claude los lee en investigaciones futuras.

Formato sugerido:

```markdown
# <título del incidente>
- Fecha / detección: <cuándo y cómo se detectó (alerta, banda, ticket, canal)>
- Impacto: <qué y a quién>
- Causa: <causa raíz con evidencia>
- Acción inmediata: <rollback, mitigación>
- Fix: <PR o changes/<slug>/>
- Eval agregado: <evals/<archivo>.json>
- Qué cambia para que no vuelva a pasar: <CLAUDE.md, hook, skill, test>
```
