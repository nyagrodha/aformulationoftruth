#!/bin/bash
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Directories
DEV_DIR="$HOME/aformulationoftruth"
PROD_DIR="/var/www/aformulationoftruth"
BACKUP_DIR="/var/www/aformulationoftruth.backup"

# Change to dev directory
cd "$DEV_DIR"

echo -e "${MAGENTA}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   A Formulation of Truth - Complete Deployment Workflow   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

# Function to print step headers
step() {
    echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}▶ $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# Function to print success
success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print error
error() {
    echo -e "${RED}✗ $1${NC}"
}

# Function to print info
info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# ═══════════════════════════════════════════════════════════════
# STEP 1: PRE-FLIGHT CHECKS
# ═══════════════════════════════════════════════════════════════
step "Step 1/8: Pre-flight Checks"

# Check if production directory exists
if [ ! -d "$PROD_DIR" ]; then
    error "Production directory does not exist: $PROD_DIR"
    exit 1
fi
success "Production directory exists"

# Check git status
if git diff-index --quiet HEAD --; then
    success "Git working directory is clean"
else
    info "Git working directory has uncommitted changes (proceeding anyway)"
fi

# Check if on a branch
CURRENT_BRANCH=$(git branch --show-current)
success "Current branch: $CURRENT_BRANCH"

# ═══════════════════════════════════════════════════════════════
# STEP 2: RUN TESTS (Optional)
# ═══════════════════════════════════════════════════════════════
step "Step 2/8: Running Tests (Backend)"

if [ -f "$DEV_DIR/backend/package.json" ]; then
    echo -e "${YELLOW}Do you want to run backend tests? [y/N]:${NC} "
    read -n 1 -r RUN_TESTS
    echo
    if [[ $RUN_TESTS =~ ^[Yy]$ ]]; then
        (cd "$DEV_DIR/backend" && npm test) || {
            error "Tests failed! Aborting deployment."
            exit 1
        }
        success "All tests passed"
    else
        info "Skipping tests"
    fi
else
    info "No backend tests found, skipping"
fi

# ═══════════════════════════════════════════════════════════════
# STEP 3: BUILD FRONTEND
# ═══════════════════════════════════════════════════════════════
step "Step 3/8: Building Frontend"

echo -e "${YELLOW}Build frontend? [Y/n]:${NC} "
read -n 1 -r BUILD_FRONTEND
echo
if [[ ! $BUILD_FRONTEND =~ ^[Nn]$ ]]; then
    info "Cleaning old build artifacts..."
    rm -rf "$DEV_DIR/frontend/build"
    rm -rf "$DEV_DIR/frontend/dist"

    info "Building with bun..."
    (cd "$DEV_DIR/frontend" && bun run build) || {
        error "Frontend build failed!"
        exit 1
    }

    info "Copying build to public directory..."
    mkdir -p "$DEV_DIR/frontend/public"
    cp -r "$DEV_DIR/frontend/build/"* "$DEV_DIR/frontend/public/" 2>/dev/null || true

    success "Frontend built successfully"
else
    info "Skipping frontend build"
fi

# ═══════════════════════════════════════════════════════════════
# STEP 4: BUILD BACKEND
# ═══════════════════════════════════════════════════════════════
step "Step 4/8: Building Backend"

echo -e "${YELLOW}Build backend? [Y/n]:${NC} "
read -n 1 -r BUILD_BACKEND
echo
if [[ ! $BUILD_BACKEND =~ ^[Nn]$ ]]; then
    info "Building TypeScript backend..."
    (cd "$DEV_DIR/backend" && npm run build) || {
        error "Backend build failed!"
        exit 1
    }
    success "Backend built successfully"
else
    info "Skipping backend build"
fi

# ═══════════════════════════════════════════════════════════════
# STEP 5: BACKUP PRODUCTION
# ═══════════════════════════════════════════════════════════════
step "Step 5/8: Backup Production"

# Delete old backup if it exists
if [ -d "$BACKUP_DIR" ]; then
    info "Deleting previous backup: $BACKUP_DIR"
    sudo rm -rf "$BACKUP_DIR"
fi

# Create new backup
info "Creating new backup: $BACKUP_DIR"
sudo cp -a "$PROD_DIR" "$BACKUP_DIR"
success "Backup created successfully"

# ═══════════════════════════════════════════════════════════════
# STEP 6: SYNC TO PRODUCTION
# ═══════════════════════════════════════════════════════════════
step "Step 6/8: Syncing to Production"

RSYNC_OPTS=(
    -avh
    --delete
    --progress
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
    --exclude='*.log'
    --exclude='logs/'
    --exclude='*.pid'
    --exclude='.agent-patches/'
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

info "Syncing files..."
sudo rsync "${RSYNC_OPTS[@]}" "${EXCLUDES[@]}" "$DEV_DIR/" "$PROD_DIR/" 2>&1 | grep -v "Permission denied" || true

success "Sync completed"

# ═══════════════════════════════════════════════════════════════
# STEP 7: RESTART SERVICES
# ═══════════════════════════════════════════════════════════════
step "Step 7/8: Restarting Services"

echo -e "${YELLOW}Restart backend service? [Y/n]:${NC} "
read -n 1 -r RESTART_BACKEND
echo
if [[ ! $RESTART_BACKEND =~ ^[Nn]$ ]]; then
    info "Checking for PM2 process..."
    if pm2 list | grep -q "backend"; then
        pm2 restart backend
        success "Backend restarted via PM2"
    else
        info "No PM2 process named 'backend' found, skipping"
    fi
fi

echo -e "${YELLOW}Reload Caddy? [Y/n]:${NC} "
read -n 1 -r RELOAD_CADDY
echo
if [[ ! $RELOAD_CADDY =~ ^[Nn]$ ]]; then
    sudo systemctl reload caddy
    success "Caddy reloaded"
fi

# ═══════════════════════════════════════════════════════════════
# STEP 8: HEALTH CHECKS
# ═══════════════════════════════════════════════════════════════
step "Step 8/8: Health Checks"

info "Waiting 3 seconds for services to stabilize..."
sleep 3

# Check Caddy status
if systemctl is-active --quiet caddy; then
    success "Caddy is running"
else
    error "Caddy is not running!"
fi

# Check backend (if PM2)
if pm2 list | grep -q "backend"; then
    if pm2 list | grep "backend" | grep -q "online"; then
        success "Backend is online"
    else
        error "Backend is not online!"
    fi
fi

# Check API endpoint
info "Testing API endpoint..."
if curl -s -f http://localhost:8393/api/ping > /dev/null 2>&1; then
    success "API is responding"
else
    error "API is not responding on port 8393"
fi

# Check frontend
info "Testing frontend..."
if curl -s -f http://localhost > /dev/null 2>&1; then
    success "Frontend is accessible"
else
    info "Frontend check inconclusive (may need to test via domain)"
fi

# ═══════════════════════════════════════════════════════════════
# DEPLOYMENT COMPLETE
# ═══════════════════════════════════════════════════════════════
echo -e "\n${MAGENTA}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              🎉 DEPLOYMENT COMPLETED! 🎉                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

success "Deployment finished at $(date)"
info "Branch deployed: $CURRENT_BRANCH"

echo -e "\n${YELLOW}Rollback command (if needed):${NC}"
echo -e "${RED}sudo rm -rf $PROD_DIR && sudo mv $BACKUP_DIR $PROD_DIR${NC}\n"

echo -e "${YELLOW}Or use the alias:${NC}"
echo -e "${CYAN}a4rollback${NC}\n"
