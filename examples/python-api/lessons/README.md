# lessons/

Post-mortems and lessons learned from incidents, one per file: `<YYYY-MM-DD>-<slug>.md`.
`/sdlc-incident` writes them and Claude reads them in future investigations.

Suggested format:

```markdown
# <incident title>
- Date / detection: <when and how it was detected (alert, band, ticket, channel)>
- Impact: <what and who>
- Cause: <root cause with evidence>
- Immediate action: <rollback, mitigation>
- Fix: <PR or changes/<slug>/>
- Eval added: <evals/<file>.json>
- What changes so it doesn't happen again: <CLAUDE.md, hook, skill, test>
```
