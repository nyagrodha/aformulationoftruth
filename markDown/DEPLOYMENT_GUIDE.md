# Deployment Guide

## Directory Structure

- **Development:** `~/aformulationoftruth/`
- **Production:** `/var/www/aformulationoftruth/`
- **Backup:** `/var/www/aformulationoftruth.backup/` (only one backup exists at a time)

The two directories are **NOT symlinked** - they are separate directories managed by rsync.

## Deployment Scripts

### 1. Basic Deployment (`a4deploy`)
**Command:** `a4deploy` or `~/aformulationoftruth/deploy.sh`

**What it does:**
- Shows dry-run preview of what will be synced
- Asks for confirmation
- Creates backup (deletes old backup first)
- Syncs files to production
- Shows next steps for manual service restart

**Use when:** You want to see exactly what will change before deploying.

### 2. Complete Workflow (`a4workflow`)
**Command:** `a4workflow` or `~/aformulationoftruth/deploy-workflow.sh`

**What it does:**
- ✅ Pre-flight checks
- 🧪 Optional: Run backend tests
- 🏗️  Optional: Build frontend (with bun)
- 🏗️  Optional: Build backend (TypeScript compilation)
- 💾 Backup production (deletes old backup)
- 🔄 Sync to production
- 🔁 Optional: Restart backend (PM2) and Caddy
- 🏥 Health checks (API, Caddy, frontend)

**Use when:** You want full control with prompts at each step.

### 3. Fully Automated (`a4auto`)
**Command:** `a4auto` or `~/aformulationoftruth/deploy-auto.sh`

**What it does:**
All the same steps as workflow, but **no prompts** - fully automated.

**Options:**
- `--no-frontend` - Skip frontend build
- `--no-backend` - Skip backend build
- `--with-tests` - Run tests before deployment (fails if tests fail)
- `--no-restart` - Skip service restarts
- `--help` - Show help

**Convenience aliases:**
- `a4auto-quick` - Sync only (no builds)
- `a4auto-frontend` - Build frontend only
- `a4auto-backend` - Build backend only

**Use when:** You want fast, automated deployment without confirmations.

**Examples:**
```bash
# Full automated deployment
a4auto

# Just sync files (no build)
a4auto-quick

# Build and deploy frontend only
a4auto-frontend

# Build and deploy with tests
a4auto --with-tests

# Build frontend but don't restart services
a4auto --no-backend --no-restart
```

### 4. Quick Sync (`a4sync`)
**Command:** `a4sync`

**What it does:**
- Quick rsync without backup or builds
- No prompts, immediate sync
- **Does NOT create backup**

**Use when:** You're doing rapid iteration and already have a known-good backup.

## Rollback

**Command:** `a4rollback`

Instantly restores the previous backup by:
1. Deleting current production directory
2. Moving backup into place

**Warning:** This is destructive! The current production version will be lost.

## What Gets Synced

### ✅ Included:
- All source code
- Configuration files (except `.env*`)
- Frontend `public/` directory
- Backend `dist/` (compiled TypeScript)
- Docker configurations
- Documentation

### ❌ Excluded:
- `.git/` metadata (logs, refs, index)
- `.env*` files (environment configs stay separate)
- `node_modules/` (must reinstall on production)
- `logs/` and `*.log`
- `*.pid` files
- Database files (`*.db`)
- Backup directories
- `uploads/` directory
- `tmp/` and `www/` directories
- `vps-storage/`

## The Uploads Folder

**Location:** `/var/www/aformulationoftruth/uploads/`

**Purpose:** Configured in backend for file uploads (5MB max, local storage)

**Current Status:**
- ✅ Exists in production (empty)
- ✅ Now exists in dev (with `.gitkeep`)
- ❌ Not currently used by any code
- 🔒 Excluded from sync (production uploads preserved)

**Configuration:**
```javascript
// backend/config/environment.js
storage: {
    type: 'local',
    uploadPath: './uploads',
    maxFileSize: 5242880, // 5MB
}
```

No actual upload middleware (multer) is currently implemented. This is reserved for future functionality.

## Tor Directory Obfuscation

**Previous:** `docker/tor/`
**Current:** `docker/pyaz/`

The Tor hidden service directory has been renamed to `pyaz` to avoid obvious naming. The `torrc` file remains named as such (it requires root access anyway).

**Container:** `pyazopay`
**Mounts:**
- `./pyaz/torrc` → `/etc/tor/torrc`
- `./pyaz/hidden_service/` → `/var/lib/tor/hidden_service/`
- `./pyaz/data/` → `/var/lib/tor/data/`

## Typical Deployment Workflow

### For Small Changes (HTML/CSS/JS)
```bash
# Edit files in ~/aformulationoftruth
# Then quick deploy:
a4auto-quick
```

### For Frontend Changes
```bash
# Edit React components
a4auto-frontend
```

### For Backend Changes
```bash
# Edit TypeScript files
a4auto-backend
```

### For Full Deploy (Frontend + Backend)
```bash
# Option 1: Interactive with prompts
a4workflow

# Option 2: Fully automated
a4auto

# Option 3: With tests
a4auto --with-tests
```

### Emergency Rollback
```bash
a4rollback
```

## Post-Deployment Verification

The automated scripts perform health checks, but you can manually verify:

```bash
# Check Caddy
sudo systemctl status caddy

# Check backend
pm2 list
pm2 logs backend

# Test API
curl http://localhost:8393/api/ping

# Check frontend
curl http://localhost

# View production logs
sudo journalctl -u caddy -f
```

## Best Practices

1. **Always commit before deploying** - Git history is your friend
2. **Use `a4workflow` for first-time deploys** - Interactive prompts help catch issues
3. **Use `a4auto` for routine deploys** - Fast and reliable
4. **Test in dev first** - Don't deploy untested code
5. **Keep one backup** - The system auto-deletes old backups
6. **Monitor after deploy** - Check logs and health endpoints
7. **Document breaking changes** - Update this guide for major changes

## Reload Shell After Setup

```bash
source ~/.bash_aliases
```

## All Available Commands

```bash
# Deployment
a4deploy              # Basic sync with dry-run preview
a4workflow            # Full workflow with prompts
a4auto                # Fully automated
a4auto-quick          # Sync only (no builds)
a4auto-frontend       # Frontend build + deploy
a4auto-backend        # Backend build + deploy
a4sync                # Quick sync (no backup!)
a4rollback            # Restore previous backup

# Building (local only)
a4otbuild             # Build frontend locally
a4build               # Build backend locally

# Other useful commands
a4                    # cd to project root
a4b                   # cd to backend
a4f                   # cd to frontend
a4status              # git status
a4health              # Check system health
```

## Troubleshooting

### Deployment fails with permission errors
```bash
# Check ownership
ls -la /var/www/aformulationoftruth

# Fix if needed
sudo chown -R marcel:marcel /var/www/aformulationoftruth
```

### Backend won't start after deploy
```bash
# Check logs
pm2 logs backend

# Restart manually
pm2 restart backend

# Or full restart
pm2 delete backend
cd /var/www/aformulationoftruth/backend
pm2 start ecosystem.config.cjs
```

### Frontend shows old version
```bash
# Clear browser cache (Ctrl+Shift+R)
# Or reload Caddy
sudo systemctl reload caddy
```

### Pyazopay container issues after deploy
```bash
# Check container
docker ps | grep pyazopay

# Restart if needed
cd ~/aformulationoftruth/docker
docker compose restart pyazopay

# Check logs
docker logs pyazopay
```
