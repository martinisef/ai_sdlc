---
'@morsadev/sdlc': patch
---

Security: `@hono/node-server` 2.x (GHSA-rmxm-3fg6-px4f). The dashboard only serves files inside the built UI directory (a sibling directory with the same prefix no longer passes the check) and compares its token in constant time.
