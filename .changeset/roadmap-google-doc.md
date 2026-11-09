---
'@morsadev/sdlc': patch
---

Roadmaps from a Google Doc link work without the Google Drive MCP: `sdlc roadmap new --source <url>` and the dashboard download a doc shared with "Anyone with the link" as `source.md` (link kept in `source_url`), so headless dashboard jobs read the real document instead of drafting from nothing. A private doc fails up front with how to share or export it, and the dashboard rejects links it cannot read.
