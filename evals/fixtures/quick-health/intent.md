---
change: health-service
status: accepted
lane: quick
author: Ana Dev
created: 2026-10-20
---
# Quick: GET /health also returns the service name

The health response should include `"service": "claims"` next to `status` and `version`, so the platform dashboard can tell services apart.
