# changes/

One change = one folder = one branch = one PR/MR.

```
changes/<YYYY-MM>-<slug>/      (or changes/<PROJ-123>-<slug>/ if there is Jira)
  intent.md   ← Stage 1 · /sdlc-intent · gate: Product Owner (status: accepted)
  spec.md     ← Stage 2 · /sdlc-spec   · gate: PO + policy owners (status: approved)
  plan.md     ← Stage 3 · /sdlc-plan   · gate: engineer / tech lead (status: approved)
```

- Branch: `change/<slug>` (with Jira: `change/PROJ-123-<slug>`). The hooks and `/sdlc-status` infer the active change from the branch.
- Every gate is recorded in git: the commit that changes `status` and fills in `approved_by`.
- The intent → spec → plan → diff → PR chain is the audit trail.
- Templates live in `_templates/`. Don't edit them per change: they get copied.
