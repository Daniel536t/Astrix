#!/usr/bin/env bash
# Build the game and publish it to a boxd machine served by nginx.
#
# Usage:  deploy/boxd/deploy.sh [machine-name]      (default: astrix)
# Auth:   boxd auth login, or export BOXD_TOKEN=<api key> for scripts/CI.
#
# Each deploy goes to /var/www/astrix/releases/<timestamp>, and the
# /var/www/astrix/current symlink is switched only after the upload succeeds.
# Roll back with:  deploy/boxd/deploy.sh --rollback [machine-name]
set -euo pipefail

BOXD="${BOXD:-boxd}"
ROLLBACK=0
if [[ "${1:-}" == "--rollback" ]]; then ROLLBACK=1; shift; fi
MACHINE="${1:-astrix}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
remote() { "$BOXD" machine exec "$MACHINE" -- bash -c "$1"; }

if [[ "$ROLLBACK" == 1 ]]; then
  remote 'set -e; cd /var/www/astrix/releases
    prev=$(ls -1 | sort | tail -n 2 | head -n 1)
    cur=$(basename "$(readlink -f /var/www/astrix/current)")
    [ -n "$prev" ] && [ "$prev" != "$cur" ] || { echo "no earlier release"; exit 1; }
    sudo ln -sfn "/var/www/astrix/releases/$prev" /var/www/astrix/current.tmp
    sudo mv -T /var/www/astrix/current.tmp /var/www/astrix/current
    sudo rm -rf "/var/www/astrix/releases/$cur"
    echo "rolled back to $prev"'
  exit 0
fi

echo "==> typecheck, test and build"
( cd "$ROOT/Game" && npm ci --no-audit --no-fund && npm run typecheck && npm test && npm run build )

RELEASE="$(date -u +%Y%m%dT%H%M%SZ)-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)"
TARBALL="$(mktemp -t astrix-XXXXXX.tgz)"
trap 'rm -f "$TARBALL"' EXIT
tar -czf "$TARBALL" -C "$ROOT/Game/dist" .

echo "==> uploading release $RELEASE to $MACHINE"
"$BOXD" machine cp "$ROOT/deploy/boxd/nginx.conf" "$MACHINE:/tmp/astrix-nginx.conf"
"$BOXD" machine cp "$TARBALL" "$MACHINE:/tmp/astrix-$RELEASE.tgz"

remote "set -euo pipefail
  command -v nginx >/dev/null || { sudo apt-get update -qq && sudo apt-get install -y -qq nginx; }
  sudo mkdir -p /var/www/astrix/releases/$RELEASE
  sudo tar -xzf /tmp/astrix-$RELEASE.tgz -C /var/www/astrix/releases/$RELEASE
  sudo chmod -R a+rX /var/www/astrix
  rm -f /tmp/astrix-$RELEASE.tgz
  sudo install -m 644 /tmp/astrix-nginx.conf /etc/nginx/sites-available/astrix
  sudo ln -sfn /etc/nginx/sites-available/astrix /etc/nginx/sites-enabled/astrix
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t
  sudo ln -sfn /var/www/astrix/releases/$RELEASE /var/www/astrix/current.tmp
  sudo mv -T /var/www/astrix/current.tmp /var/www/astrix/current
  sudo systemctl enable --now nginx >/dev/null 2>&1 || true
  sudo systemctl reload nginx
  # Keep the five newest releases for rollback.
  cd /var/www/astrix/releases && ls -1 | sort | head -n -5 | xargs -r sudo rm -rf
  curl -fsS http://127.0.0.1/healthz >/dev/null
  echo \"live: \$(readlink -f /var/www/astrix/current)\""

URL="$("$BOXD" machine get "$MACHINE" 2>/dev/null | awk '$1 == "url:" { print $2 }')"
echo "==> done: https://${URL:-$MACHINE.boxd.sh}"
