#!/usr/bin/env bash
# Deploy api/ to Vercel production (project: qolar-api).
#
# Same trick as web/deploy.sh: Vercel blocks deployments whose git commit
# author it can't match to the account, and the CLI hangs on the blocked
# build. Staging a git-free copy sidesteps that entirely.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
STAGE="$(mktemp -d /tmp/qolar-api-deploy.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT

rsync -a --exclude .venv --exclude __pycache__ --exclude '.env*' --exclude .git \
  --exclude link_test.html --exclude docker-compose.yml --exclude Dockerfile \
  --exclude tests --exclude requirements-dev.txt \
  "$HERE/" "$STAGE/"
cp -R "$HERE/.vercel" "$STAGE/.vercel"

cd "$STAGE"
vercel --prod --yes "$@"
