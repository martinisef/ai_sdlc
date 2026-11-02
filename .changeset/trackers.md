---
'@morsadev/sdlc': minor
---

Trackers: GitHub Issues and Linear join Jira behind one `Tracker` interface (`tracker.provider: github | linear`). GitHub follows the loop with `sdlc:<stage>` labels and closes the issue on merge (`GH_TOKEN`); Linear moves workflow states over GraphQL (`LINEAR_API_KEY`, `tracker.team_key`). Keys `#123`, `owner/repo#123` and `ENG-123` are recognized. `sdlc ci jira-merged` is now `sdlc ci tracker-merged` (the old name still works) and the templates pass `GH_TOKEN` and `LINEAR_API_KEY`. The `team-github` preset defaults to GitHub Issues. New setup guides `trackers/github.md` and `trackers/linear.md`, and a Trackers reference page.
