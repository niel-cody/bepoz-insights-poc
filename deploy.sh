#!/bin/sh
# Ship the Feros Strategic Review to production on Vercel.
#
#   sh deploy.sh
#
# Uses .vercel/project.json (already linked to
# pixie-dust-industries/feros-strategic-review) and your own `vercel` login.
# If it asks you to log in, run `npx vercel login` once and re-run this.
#
# Nothing here touches git or GitHub. The encrypted dataset never leaves
# this folder except as part of the deployment itself.
set -e
cd "$(dirname "$0")"

echo "==> installing dependencies"
npm install

echo "==> type check"
npx tsc --noEmit

echo "==> building"
npm run build

echo "==> deploying to production"
npx vercel deploy --prod

echo
echo "Done. Open https://feros-strategic-review.vercel.app and check the"
echo "top-right switcher reads: Classic | New | Thinking"
