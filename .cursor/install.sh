#!/usr/bin/env bash
#
# Cloud Agent install phase for aformulationoftruth (Deno Fresh + PostgreSQL).
#
# Idempotent, one-time repository bootstrap. It provisions the toolchain the
# app needs (Deno v2.x, matching .github/workflows/ci.yml; PostgreSQL 16),
# creates the local development database, writes a local-only .env.fresh, and
# warms the Deno dependency cache. Per-boot work (starting PostgreSQL, applying
# migrations, running the dev server) lives in start.sh and environment.json
# terminals, not here.
set -euo pipefail

cd "$(dirname "$0")/.."

# --- Deno (pinned to v2.x, matching CI's denoland/setup-deno) ---
if ! command -v deno >/dev/null 2>&1; then
  curl -fsSL https://deno.land/install.sh | sh
  sudo ln -sf "$HOME/.deno/bin/deno" /usr/local/bin/deno
fi
export PATH="$HOME/.deno/bin:$PATH"
deno --version

# --- PostgreSQL 16 ---
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
fi

# Start the cluster so we can create the role and database. Safe to call when
# it is already running.
sudo pg_ctlcluster 16 main start || true
for _ in $(seq 1 30); do
  sudo -u postgres pg_isready -q && break
  sleep 1
done

# Create the development role and database (idempotent).
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='a4ot'" | grep -q 1 ||
  sudo -u postgres psql -c "CREATE USER a4ot WITH PASSWORD 'a4ot' CREATEDB;"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='a4ot'" | grep -q 1 ||
  sudo -u postgres psql -c "CREATE DATABASE a4ot OWNER a4ot;"

# Local-only development config. main.ts (deno task start) and migrate.ts read
# .env.fresh; these are throwaway localhost credentials, and .env.fresh is
# gitignored. Real secrets (SMTP, age recipients, JWT keys) belong in Cloud
# Agent secrets, not here.
if [ ! -f .env.fresh ]; then
  cat > .env.fresh <<'EOF'
DATABASE_URL=postgres://a4ot:a4ot@127.0.0.1:5432/a4ot
PORT=8000
EOF
fi

# Warm the dependency cache for both the production entrypoint and the dev
# builder so the first boot does not pay the download cost.
deno install
deno cache main.ts dev.ts migrate.ts

echo "[install] done"
