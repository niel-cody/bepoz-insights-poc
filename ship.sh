#!/bin/sh
# Ship whatever is in this folder.
#
#   sh ship.sh "what changed"
#
# Sweeps any stale git locks first (they appear when the file bridge has
# touched this repo), then commits and pushes. With the repo connected to
# Vercel, the push is the deploy — nothing else to run.
set -e
cd "$(dirname "$0")"
find .git -name '*.lock' -delete 2>/dev/null || true
git add -A
git commit -m "${1:-Update}" || { echo "nothing to commit"; exit 0; }
git push
echo
echo "Pushed. Vercel is building: https://vercel.com/pixie-dust-industries/feros-strategic-review"
