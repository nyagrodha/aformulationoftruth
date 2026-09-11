#!/usr/bin/env bash
#
# Cloud Agent start phase: per-boot reconciliation.
#
# Brings PostgreSQL up (the process does not survive a snapshot boot even
# though its data directory does) and applies any pending migrations. Migrations
# are idempotent — migrate.ts skips already-applied files — so re-running on
# every boot is safe. The dev server itself runs as a visible terminal (see
# environment.json), not from here.
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="$HOME/.deno/bin:$PATH"

sudo pg_ctlcluster 16 main start || true
for _ in $(seq 1 30); do
  sudo -u postgres pg_isready -q && break
  sleep 1
done

deno run --allow-net --allow-env --allow-read migrate.ts

echo "[start] postgres ready, migrations applied"
