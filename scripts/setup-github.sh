#!/usr/bin/env bash
# One-time GitHub setup for this repository. Needs `gh auth login` with admin rights on the repo.
#   bash scripts/setup-github.sh [owner/repo]          (default martinisef/ai_sdlc)
# Secrets are only set when the variables are exported: ANTHROPIC_API_KEY, NPM_TOKEN (first publish only).
# Idempotent: safe to run again.
set -euo pipefail
REPO="${1:-martinisef/ai_sdlc}"
cd "$(dirname "$0")/.."

gh auth status >/dev/null

echo "repository"
if ! gh repo view "$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO" --public --description "The AI-native SDLC loop for Claude Code, Cursor and AGENTS.md agents" --source . --remote origin --push
else
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$REPO.git"
  git push -u origin main
fi
gh repo edit "$REPO" --homepage "https://${REPO%%/*}.github.io/${REPO#*/}/" \
  --add-topic sdlc --add-topic ai-agents --add-topic claude-code --add-topic cursor --add-topic agents-md --add-topic guardrails

echo "actions: workflow token may open PRs (changesets 'Version packages', bands draft PRs)"
gh api -X PUT "repos/$REPO/actions/permissions/workflow" -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true

echo "pages: deployed by .github/workflows/docs.yml"
gh api -X POST "repos/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 || gh api -X PUT "repos/$REPO/pages" -f build_type=workflow >/dev/null

echo "branch protection on main"
gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["check (22.18)", "check (24)", "examples", "docs"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0, "require_code_owner_reviews": false },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

echo "secrets"
[ -n "${ANTHROPIC_API_KEY:-}" ] && printf '%s' "$ANTHROPIC_API_KEY" | gh secret set ANTHROPIC_API_KEY -R "$REPO" && echo "  ANTHROPIC_API_KEY set"
[ -n "${NPM_TOKEN:-}" ] && printf '%s' "$NPM_TOKEN" | gh secret set NPM_TOKEN -R "$REPO" && echo "  NPM_TOKEN set (remove it once trusted publishing is configured)"

cat <<EOF

Done. Still manual:
  1. npm: the @morsadev org must exist with you as owner. After the first publish, add a
     trusted publisher for @morsadev/sdlc (GitHub Actions, $REPO, workflow release.yml) and delete NPM_TOKEN.
  2. With more maintainers: raise required_approving_review_count to 1 and enable require_code_owner_reviews.
EOF
