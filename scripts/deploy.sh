#!/usr/bin/env bash
#
# Deploy aformulationoftruth.com: check the schema, fast-forward, restart, verify.
#
#   cd /var/www/aformulationoftruth && bash scripts/deploy.sh
#
# Until this file existed, a deploy was `git pull --ff-only` and a restart by
# hand, and nothing compared the database with the migrations. That is how
# 015_pdf_delivery_queue.sql was skipped while 016-018 were applied, and PDF
# copies failed silently for over a week with /api/health reporting ok.
#
# Order matters, and is the point of the script:
#
#   1. fetch, and refuse anything that is not a fast-forward
#   2. run scripts/check-schema.ts FROM THE INCOMING COMMIT, exported to a
#      temporary directory, against the live database. The check reads the
#      migrations next to itself, so this tests the database against the code
#      about to ship -- before a single file in the live tree changes.
#   3. only on a clean check, fast-forward the live tree
#   4. restart (Fresh fixes its routes and static-file map at boot, so a pull
#      without a restart serves the old code, or truncated bodies)
#   5. poll /api/health and judge it by curl's exit status and the JSON, not
#      the status line: Fresh can send 200 and then abort the body
#
# A failed check in step 2 leaves the live tree exactly as it was. Had the check
# run after the pull instead, the service would keep running old code over a new
# tree, and the next crash-restart (Restart=always) would boot the new code
# against a database that lacks what it needs.
#
# Nothing here prints DATABASE_URL or reads rows; check-schema.ts prints only
# table, column and file names. See CLAUDE.md, zero-logging.

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/aformulationoftruth}"
BRANCH="${BRANCH:-production}"
SERVICE="${SERVICE:-aformulationoftruth-fresh.service}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:7268/api/health}"

cd "$APP_DIR"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "[deploy] tracked files are modified in $APP_DIR; refusing to deploy over them" >&2
  exit 1
fi

git fetch --quiet origin "$BRANCH"
current="$(git rev-parse HEAD)"
incoming="$(git rev-parse "origin/$BRANCH")"

if [ "$current" = "$incoming" ]; then
  echo "[deploy] already at ${incoming:0:7}; nothing to deploy"
  exit 0
fi
if ! git merge-base --is-ancestor "$current" "$incoming"; then
  echo "[deploy] origin/$BRANCH is not a fast-forward of ${current:0:7}; refusing" >&2
  exit 1
fi

echo "[deploy] ${current:0:7} -> ${incoming:0:7}"

staged="$(mktemp -d)"
trap 'rm -rf "$staged"' EXIT
git archive "$incoming" | tar -x -C "$staged"

# cwd stays $APP_DIR so the check loads the live .env; the script, its
# migrations and its import map all come from the incoming commit.
set +e
deno run --allow-net --allow-env --allow-read --config "$staged/deno.json" "$staged/scripts/check-schema.ts"
check=$?
set -e
case "$check" in
  0) ;;
  1)
    echo "[deploy] schema drift: apply the migrations named above as the admin role, then rerun. Nothing was changed." >&2
    exit 1
    ;;
  *)
    echo "[deploy] schema check could not run (status $check). Nothing was changed." >&2
    exit 1
    ;;
esac

git merge --ff-only --quiet "$incoming"
sudo systemctl restart "$SERVICE"

for _ in $(seq 1 30); do
  sleep 2
  if body="$(curl --silent --show-error --max-time 5 "$HEALTH_URL" 2>/dev/null)" &&
    printf '%s' "$body" | grep -q '"status":"ok"'; then
    echo "[deploy] ${incoming:0:7} is live and healthy"
    exit 0
  fi
done

echo "[deploy] ${incoming:0:7} was deployed but $HEALTH_URL is not ok after 60 s:" >&2
printf '%s\n' "${body:-<no response>}" >&2
echo "[deploy] to roll back: git -C $APP_DIR reset --hard ${current:0:7} && sudo systemctl restart $SERVICE" >&2
exit 1
