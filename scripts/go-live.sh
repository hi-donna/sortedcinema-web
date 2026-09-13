#!/usr/bin/env bash
# One-time go-live for sortedcinema-web. Run from the repo root on a machine with `gh` logged in:
#   bash scripts/go-live.sh
# Creates the PUBLIC GitHub repo (Pages on a private repo needs a paid plan; nothing here is
# secret — the TMDB key is stored as an Actions secret, never as a file), pushes, adds the
# secret from ../stan/.env, switches Pages to "GitHub Actions", and starts the first run.
set -euo pipefail
OWNER="${OWNER:-hi-donna}"
REPO="${REPO:-sortedcinema-web}"
KEY="${TMDB_API_KEY:-$(grep -E '^TMDB_API_KEY=' ../stan/.env | cut -d= -f2- | tr -d '"' | tr -d "'")}"
[ -n "$KEY" ] || { echo "No TMDB_API_KEY found (set it in the environment or in ../stan/.env)"; exit 1; }

if ! git remote get-url origin >/dev/null 2>&1; then
  gh repo create "$OWNER/$REPO" --public --source=. --remote=origin --push
else
  git push -u origin main
fi
gh secret set TMDB_API_KEY --repo "$OWNER/$REPO" --body "$KEY"
# Pages: build from Actions (idempotent; ignore "already exists")
gh api -X POST "repos/$OWNER/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 \
  || gh api -X PUT "repos/$OWNER/$REPO/pages" -f build_type=workflow >/dev/null
gh workflow run site --repo "$OWNER/$REPO"
echo
echo "Done. First run: gh run watch --repo $OWNER/$REPO"
echo "Site (after ~3 min): https://$OWNER.github.io/$REPO/"
