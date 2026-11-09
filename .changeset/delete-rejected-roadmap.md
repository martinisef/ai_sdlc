---
'@morsadev/sdlc': minor
---

Dashboard: the author of a rejected roadmap can delete it (**Delete roadmap**). The folder is removed with `git rm` in its own commit, so the history keeps it; a roadmap with tickets already created cannot be deleted. New `DELETE /api/roadmaps/:slug`.
