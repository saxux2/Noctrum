#!/bin/sh
# Deploys vault-api + noctrum-tg to the Railway "vault-api" service.
# Usage (from noctrum/): sh deploy/vault-api-tg/deploy.sh
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CTX="$(mktemp -d)"
trap 'rm -rf "$CTX"' EXIT

copy() { # copy a package without node_modules, env files or local data
  mkdir -p "$CTX/$1"
  (cd "$ROOT/$1" && tar cf - --exclude=node_modules --exclude=.env --exclude='.env.*' --exclude=data --exclude=dist .) | (cd "$CTX/$1" && tar xf -)
}
copy noctrum-vault-api
copy noctrum-tg
cp "$ROOT/deploy/vault-api-tg/Dockerfile" "$ROOT/deploy/vault-api-tg/start.sh" "$CTX/"

cd "$ROOT"
railway up "$CTX" --path-as-root --no-gitignore --service vault-api --detach
