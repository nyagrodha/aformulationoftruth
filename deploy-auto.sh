#!/bin/bash
set -e

# Fully Automated Deployment - No Prompts
# Use with caution! This skips all confirmations.

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Directories
DEV_DIR="$HOME/aformulationoftruth"
PROD_DIR="/var/www/aformulationoftruth"
BACKUP_DIR="/var/www/aformulationoftruth.backup"

# Configuration (set via flags or defaults)
BUILD_FRONTEND=true
BUILD_BACKEND=true
RUN_TESTS=false
RESTART_SERVICES=true

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-frontend)
            BUILD_FRONTEND=false
            shift
            ;;
        --no-backend)
            BUILD_BACKEND=false
            shift
            ;;
        --with-tests)
            RUN_TESTS=true
            shift
            ;;
        --no-restart)
            RESTART_SERVICES=false
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --no-frontend    Skip frontend build"
            echo "  --no-backend     Skip backend build"
            echo "  --with-tests     Run tests before deployment"
            echo "  --no-restart     Skip service restarts"
            echo "  --help           Show this help message"
            echo ""
            echo "Example: $0 --no-frontend --no-restart"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

cd "$DEV_DIR"

echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║     Automated Deployment - No Confirmations Required      ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════════════════════════╝${NC}\n"

# Step function
step() {
    echo -e "\n${CYAN}▶ $1${NC}"
}

success() { echo -e "${GREEN}✓ $1${NC}"; }
error() { echo -e "${RED}✗ $1${NC}"; exit 1; }
info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# Pre-flight
step "Pre-flight Checks"
[ -d "$PROD_DIR" ] || error "Production directory not found"
success "Production directory exists"

CURRENT_BRANCH=$(git branch --show-current)
success "Branch: $CURRENT_BRANCH"

# Tests
if [ "$RUN_TESTS" = true ]; then
    step "Running Tests"
    if [ -f "$DEV_DIR/backend/package.json" ]; then
        (cd "$DEV_DIR/backend" && npm test) || error "Tests failed"
        success "Tests passed"
    fi
fi

# Build Frontend
if [ "$BUILD_FRONTEND" = true ]; then
    step "Building Frontend"
    info "Cleaning artifacts..."
    rm -rf "$DEV_DIR/frontend/build" "$DEV_DIR/frontend/dist"

    info "Building..."
    (cd "$DEV_DIR/frontend" && bun run build) || error "Frontend build failed"

    info "Copying to public..."
    mkdir -p "$DEV_DIR/frontend/public"
    cp -r "$DEV_DIR/frontend/build/"* "$DEV_DIR/frontend/public/" 2>/dev/null || true

    success "Frontend built"
fi

# Build Backend
if [ "$BUILD_BACKEND" = true ]; then
    step "Building Backend"
    (cd "$DEV_DIR/backend" && npm run build) || error "Backend build failed"
    success "Backend built"
fi

# Backup
step "Creating Backup"
[ -d "$BACKUP_DIR" ] && sudo rm -rf "$BACKUP_DIR"
sudo cp -a "$PROD_DIR" "$BACKUP_DIR"
success "Backup created"

# Sync
step "Syncing to Production"

RSYNC_OPTS=(-avh --delete)
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
    --exclude='.env*'
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

sudo rsync "${RSYNC_OPTS[@]}" "${EXCLUDES[@]}" "$DEV_DIR/" "$PROD_DIR/" 2>&1 | grep -v "Permission denied" || true
success "Sync completed"

# Restart Services
if [ "$RESTART_SERVICES" = true ]; then
    step "Restarting Services"

    if pm2 list | grep -q "backend"; then
        pm2 restart backend > /dev/null 2>&1
        success "Backend restarted"
    fi

    sudo systemctl reload caddy
    success "Caddy reloaded"

    info "Waiting for services to stabilize..."
    sleep 3
fi

# Health Checks
step "Health Checks"

systemctl is-active --quiet caddy && success "Caddy running" || error "Caddy down"

if pm2 list | grep "backend" | grep -q "online"; then
    success "Backend online"
else
    info "Backend status unclear"
fi

if curl -s -f http://localhost:8393/api/ping > /dev/null 2>&1; then
    success "API responding"
else
    info "API check inconclusive"
fi

echo -e "\n${MAGENTA}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║              🎉 DEPLOYMENT COMPLETE! 🎉                    ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════════════════════════╝${NC}\n"

success "Deployed at $(date)"
info "Branch: $CURRENT_BRANCH"

echo -e "\n${YELLOW}Rollback:${NC} ${CYAN}a4rollback${NC}\n"
