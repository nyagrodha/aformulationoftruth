#!/bin/bash
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directories
DEV_DIR="$HOME/aformulationoftruth"
PROD_DIR="/var/www/aformulationoftruth"
BACKUP_DIR="/var/www/aformulationoftruth.backup"

# Ensure we're in the dev directory
cd "$DEV_DIR"

echo -e "${BLUE}=== A Formulation of Truth - Deployment Script ===${NC}\n"
echo -e "${YELLOW}Dev:${NC}  $DEV_DIR"
echo -e "${YELLOW}Prod:${NC} $PROD_DIR\n"

# Check if production directory exists
if [ ! -d "$PROD_DIR" ]; then
    echo -e "${RED}Error: Production directory does not exist: $PROD_DIR${NC}"
    exit 1
fi

# Rsync options and exclusions
RSYNC_OPTS=(
    -avh
    --delete
    --progress
    --stats
)

EXCLUDES=(
    --exclude='.git/COMMIT_EDITMSG'
    --exclude='.git/FETCH_HEAD'
    --exclude='.git/ORIG_HEAD'
    --exclude='.git/index'
    --exclude='.git/logs/'
    --exclude='.git/refs/'
    --exclude='.git/branches/'
    --exclude='.git/git-crypt/'
    --exclude='.git/config'
    --exclude='.env'
    --exclude='.env.local'
    --exclude='.env.save'
    --exclude='.env.example'
    --exclude='.env.keycloak'
    --exclude='node_modules/'
    --exclude='frontend/node_modules/'
    --exclude='backend/node_modules/'
    --exclude='frontend/build/'
    --exclude='frontend/dist/'
    --exclude='backend/dist/'
    --exclude='*.log'
    --exclude='logs/'
    --exclude='*.pid'
    --exclude='.agent-patches/'
    --exclude='.eslintrc.js'
    --exclude='*.db'
    --exclude='*.db-journal'
    --exclude='*.db-shm'
    --exclude='*.db-wal'
    --exclude='.config/npm/'
    --exclude='*.backup*/'
    --exclude='public.backup*/'
    --exclude='uploads/'
    --exclude='tmp/'
    --exclude='www/'
    --exclude='vps-storage/'
)

echo -e "${BLUE}Step 1: Dry-run preview${NC}\n"
echo -e "${YELLOW}The following changes will be made:${NC}\n"

# Dry-run to show what will be synced
sudo rsync "${RSYNC_OPTS[@]}" --dry-run "${EXCLUDES[@]}" "$DEV_DIR/" "$PROD_DIR/" 2>&1 | grep -v "^sending incremental file list$" | grep -v "^$" | grep -v "Permission denied" | head -50

echo -e "\n${YELLOW}(Showing first 50 changes)${NC}\n"

# Ask for confirmation
read -p "$(echo -e ${GREEN}"Continue with deployment? [y/N]: "${NC})" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Deployment cancelled.${NC}"
    exit 0
fi

echo -e "\n${BLUE}Step 2: Backup production${NC}\n"

# Delete old backup if it exists
if [ -d "$BACKUP_DIR" ]; then
    echo -e "${YELLOW}Deleting previous backup: $BACKUP_DIR${NC}"
    sudo rm -rf "$BACKUP_DIR"
fi

# Create new backup
echo -e "${GREEN}Creating new backup: $BACKUP_DIR${NC}"
sudo cp -a "$PROD_DIR" "$BACKUP_DIR"
echo -e "${GREEN}✓ Backup created successfully${NC}\n"

echo -e "${BLUE}Step 3: Syncing to production${NC}\n"

# Perform the actual sync
sudo rsync "${RSYNC_OPTS[@]}" "${EXCLUDES[@]}" "$DEV_DIR/" "$PROD_DIR/"

echo -e "\n${GREEN}=== Deployment Complete ===${NC}\n"
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Rebuild frontend if needed: ${BLUE}cd /var/www/aformulationoftruth/frontend && npm run build${NC}"
echo -e "  2. Restart backend if needed: ${BLUE}pm2 restart a4mula-backend${NC}"
echo -e "  3. Reload Caddy if needed: ${BLUE}sudo systemctl reload caddy${NC}"
echo -e "\n${YELLOW}Rollback (if needed):${NC}"
echo -e "  ${RED}sudo rm -rf $PROD_DIR && sudo mv $BACKUP_DIR $PROD_DIR${NC}\n"
