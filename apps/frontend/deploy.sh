#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

# --- find build output ---
BUILD_DIR="${BUILD_DIR:-}"
if [ -z "${BUILD_DIR}" ]; then
  for d in build dist; do
    [ -f "$d/index.html" ] && BUILD_DIR="$d"
  done
fi
if [ -z "${BUILD_DIR}" ]; then
  echo "No build output found; running 'npm run build'..."
  npm run build
  [ -f build/index.html ] && BUILD_DIR="build"
  [ -z "${BUILD_DIR}" ] && [ -f dist/index.html ] && BUILD_DIR="dist"
fi
[ -z "${BUILD_DIR}" ] && { echo "ERROR: no build or dist found."; exit 1; }

RELEASES="$APP_DIR/www/releases"
CURRENT="$APP_DIR/www/current"
TS="$(date +%Y%m%d%H%M%S)"
NEW_RELEASE="$RELEASES/$TS"

mkdir -p "$RELEASES" "$NEW_RELEASE"

# --- copy files ---
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$BUILD_DIR"/ "$NEW_RELEASE"/
else
  cp -a "$BUILD_DIR"/. "$NEW_RELEASE"/
fi

# quick health check
test -f "$NEW_RELEASE/index.html"

# --- atomic swap ---
ln -sfn "$NEW_RELEASE" "$CURRENT"

# optional: set ownership (uncomment if you want www-data to own releases)
# chown -h www-data:www-data "$CURRENT"
# chown -R www-data:www-data "$NEW_RELEASE"

# reload nginx if present
if command -v nginx >/dev/null 2>&1; then
  sudo nginx -t && sudo systemctl reload nginx || true
fi

echo "Deployed $BUILD_DIR -> $NEW_RELEASE"
