#!/bin/bash
# Git auto-sync script for backup server
# Syncs main, dev, and production branches with origin

REPO_DIR="/var/www/aformulationoftruth"
LOG_FILE="/var/log/git-sync.log"
LOCK_FILE="/tmp/git-sync.lock"
BRANCHES=("main" "dev" "production")

# Prevent concurrent runs using flock
exec 200>"$LOCK_FILE"
flock -n 200 || { echo "$(date '+%Y-%m-%d %H:%M:%S') - Sync already running, skipping" >> "$LOG_FILE"; exit 0; }

cd "$REPO_DIR" || exit 1

echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting git sync" >> "$LOG_FILE"

# Fetch all updates from origin
git fetch origin --prune >> "$LOG_FILE" 2>&1

# Update each branch
for branch in "${BRANCHES[@]}"; do
    git checkout "$branch" >> "$LOG_FILE" 2>&1
    git reset --hard "origin/$branch" >> "$LOG_FILE" 2>&1
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Updated $branch to $(git rev-parse --short HEAD)" >> "$LOG_FILE"
done

# Return to production branch
git checkout production >> "$LOG_FILE" 2>&1

echo "$(date '+%Y-%m-%d %H:%M:%S') - Sync complete" >> "$LOG_FILE"
echo "---" >> "$LOG_FILE"
