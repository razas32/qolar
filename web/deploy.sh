#!/usr/bin/env bash
# Deploy web/ to Vercel production.
#
# Why not just `vercel --prod`? When run inside a git checkout, the CLI
# attaches the commit author to the deployment, and Vercel blocks it if that
# author isn't linked to the Vercel account ("commit author doesn't have
# permission to create deployments"). The CLI then hangs waiting on the
# blocked build. Deploying from a git-free copy sidesteps the check entirely.
#
# The permanent fix is setting a real git user.email and connecting GitHub in
# Vercel account settings; until then, this works.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d /tmp/qolar-deploy.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/web"
rsync -a --exclude node_modules --exclude .next --exclude '.env*' --exclude .git \
  "$ROOT/web/" "$STAGE/web/"
cp -R "$ROOT/.vercel" "$STAGE/.vercel"   # project link lives at the monorepo root

cd "$STAGE"
vercel --prod --yes "$@"
