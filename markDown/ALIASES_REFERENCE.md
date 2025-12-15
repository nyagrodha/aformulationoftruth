# A4MULA Bash Aliases Reference

Complete reference for all bash aliases and functions for the aformulationoftruth project.

## 📋 Quick Index

- [Navigation](#-navigation)
- [Development](#-development)
- [Logs](#-logs)
- [Database](#-database)
- [Configuration](#-configuration)
- [Type Checking](#-type-checking)
- [Server Management](#-server-management)
- [Health Checks](#-health-checks)
- [API Testing](#-api-testing)
- [Documentation](#-documentation)
- [Git Helpers](#-git-helpers)
- [Backup & Restore](#-backup--restore)
- [Cleanup](#-cleanup)
- [Code Search & Stats](#-code-search--stats)

---

## 🧭 Navigation

Navigate quickly between project directories:

```bash
a4          # Go to project root (~/aformulationoftruth)
a4b         # Go to backend directory
a4f         # Go to frontend directory
```

**Examples:**
```bash
$ a4b && pwd
/home/marcel/aformulationoftruth/backend

$ a4f && ls
build  node_modules  package.json  public  src
```

---

## 🛠️ Development

### Backend Development Commands

```bash
a4dev       # Start backend in development mode (hot reload)
a4build     # Build TypeScript to dist/
a4start     # Start production server
a4test      # Run backend tests
```

**Examples:**
```bash
# Start development server
$ a4dev
Server running on port 5742

# Build for production
$ a4build
✓ Compiled successfully

# Run tests
$ a4test
PASS tests/validation.test.ts
```

### Frontend Build

```bash
a4otbuild   # Build and deploy frontend (uses bun)
```

**What it does:**
1. Cleans build artifacts
2. Builds with bun + react-scripts
3. Copies to public/
4. Reloads Caddy

---

## 📝 Logs

### Tail Logs in Real-time

```bash
a4logs      # Tail combined logs
a4errors    # Tail error logs only
a4logsall   # Tail all log files
```

### View Logs with Syntax Highlighting

```bash
a4viewlogs      # View combined.log with colors
a4viewerrors    # View error.log with colors
```

**Examples:**
```bash
$ a4errors
{"timestamp":"2025-11-22 10:30:15","level":"error","message":"Database connection failed"}

$ a4viewlogs
# Opens in pager with JSON syntax highlighting
```

### Clear Logs

```bash
a4logsclear     # Delete all log files
```

---

## 💾 Database

### Direct Database Access

```bash
a4db        # Open psql prompt to a4m_db
a4dbtest    # Test database connection with simple query
```

**Examples:**
```bash
$ a4db
a4m_db=> SELECT COUNT(*) FROM users;
 count
-------
   156
(1 row)

$ a4dbtest
 current_database | current_user |           version
------------------+--------------+-----------------------------
 a4m_db           | a4m_app      | PostgreSQL 15.3
```

### Test Connection Using Refactored Config

```bash
a4dbping    # Test database using config/database.ts
```

**Example:**
```bash
$ a4dbping
🔄 Initializing database schema...
✅ Database schema initialized successfully
✅ Database connection successful
```

---

## ⚙️ Configuration

### View Configuration

```bash
a4config        # View entire configuration (JSON)
a4configtest    # Validate configuration
```

**Examples:**
```bash
$ a4configtest
✅ Configuration validated successfully
✅ Configuration is valid

$ a4config
📋 Configuration:
{
  "project": { "name": "aformulationoftruth", ... },
  "server": { "port": 5742, ... },
  ...
}
```

### Manage Environment Variables

```bash
a4env           # Edit .env.local (uses $EDITOR)
a4envshow       # View .env.local with syntax highlighting
a4envcheck      # List all set environment variables (sorted)
```

**Examples:**
```bash
$ a4envcheck
API_BASE_URL=http://localhost:5000
BASE_URL=https://aformulationoftruth.com
DATABASE_URL=postgresql://...
JWT_SECRET=+Rw+suiD3UdO...
PORT=5742
...

$ a4env
# Opens .env.local in your editor
```

---

## 🔍 Type Checking

### TypeScript Compilation Check

```bash
a4tsc           # Check for type errors (no output files)
a4tswatch       # Watch for type errors continuously
```

**Examples:**
```bash
$ a4tsc
✓ No type errors found

$ a4tswatch
Starting compilation in watch mode...
File change detected. Starting incremental compilation...
```

---

## 🚀 Server Management

### PM2 Process Management

```bash
a4pm2           # List all PM2 processes
a4restart       # Restart backend process
a4stop          # Stop backend process
a4pm2logs       # View PM2 logs
a4pm2flush      # Clear PM2 logs
```

**Examples:**
```bash
$ a4pm2
┌─────┬────────────┬─────────┬─────────┬─────────┬──────────┐
│ id  │ name       │ mode    │ status  │ cpu     │ memory   │
├─────┼────────────┼─────────┼─────────┼─────────┼──────────┤
│ 0   │ backend    │ fork    │ online  │ 0%      │ 45.2mb   │
└─────┴────────────┴─────────┴─────────┴─────────┴──────────┘

$ a4restart
✅ backend restarted
```

---

## 🏥 Health Checks

### Comprehensive Health Check

```bash
a4health    # Check API, database, and recent errors
```

**Example Output:**
```bash
$ a4health
🏥 Checking A4MULA Health...

📡 API Ping:
{
  "pong": true,
  "timestamp": "2025-11-22T10:30:15.123Z"
}

💾 Database:
✅ Database connected

📝 Recent Errors:
✅ No recent errors
```

---

## 🧪 API Testing

### Quick API Tests

```bash
a4ping                      # Test /api/ping endpoint
a4test-auth [email]         # Test magic link auth
```

**Examples:**
```bash
$ a4ping
{
  "pong": true,
  "timestamp": "2025-11-22T10:30:15.123Z"
}

$ a4test-auth marcel@example.com
🔐 Testing auth with email: marcel@example.com
{
  "message": "Magic link sent to marcel@example.com"
}
```

---

## 📚 Documentation

### View Documentation with Syntax Highlighting

```bash
a4docs          # View REFACTORING_SUMMARY.md
a4quickstart    # View QUICK_START.md
a4readme        # View README.md
```

**Example:**
```bash
$ a4docs
# Opens REFACTORING_SUMMARY.md in pager with markdown highlighting
```

---

## 🌿 Git Helpers

### Common Git Operations

```bash
a4status    # Git status
a4diff      # Git diff
a4log       # Git log (last 20 commits, graph)
a4branch    # List branches with details
```

**Examples:**
```bash
$ a4log
* f0321b0 (HEAD -> dev) Remove local env from repo
* a7ccee9 Complete E2E testing fixes
* cb24d16 Restore VPN functionality

$ a4status
On branch dev
Changes not staged for commit:
  modified:   backend/server.ts
```

---

## 💾 Backup & Restore

### Create Full Backup

```bash
a4backup    # Backup database, config, and logs
```

**Example Output:**
```bash
$ a4backup
💾 Creating backup at /home/marcel/backups/a4mula_20251122_103015...
📊 Backing up database...
⚙️  Backing up configuration...
📝 Backing up logs...
✅ Backup complete: /home/marcel/backups/a4mula_20251122_103015
total 2.3M
-rw-r--r-- 1 marcel marcel 2.1M Nov 22 10:30 database.sql
-rw-r--r-- 1 marcel marcel 4.2K Nov 22 10:30 env.local
drwxr-xr-x 2 marcel marcel 4.0K Nov 22 10:30 logs
```

---

## 🧹 Cleanup

### Clean Development Artifacts

```bash
a4clean     # Remove dist/, build/, caches
```

**Example:**
```bash
$ a4clean
🧹 Cleaning development artifacts...
✅ Clean complete
```

### Full Reset

```bash
a4reset     # Remove node_modules and reinstall (asks for confirmation)
```

**Example:**
```bash
$ a4reset
⚠️  This will remove node_modules and reinstall. Continue? (y/N)
y
🗑️  Removing node_modules...
📦 Reinstalling backend dependencies...
📦 Reinstalling frontend dependencies...
✅ Reset complete
```

---

## 🔎 Code Search & Stats

### View Project Structure

```bash
a4tree      # Show backend directory tree (3 levels)
```

**Example:**
```bash
$ a4tree
📁 A4MULA Backend Structure:
backend/
├── config
│   ├── database.ts
│   ├── environment.ts
│   ├── middleware.ts
│   └── routes.ts
├── middleware
│   ├── errors
│   └── validators
...
```

### Search Codebase

```bash
a4grep <search_term>    # Grep across entire codebase
```

**Example:**
```bash
$ a4grep "generateHashedUsername"
backend/utils/shared/username.ts:15:export function generateHashedUsername(
backend/routes/answers.ts:42:  const username = generateHashedUsername(email, jwtSecret);
```

### Count Lines of Code

```bash
a4loc       # Count lines in backend (TS/JS) and frontend
```

**Example Output:**
```bash
$ a4loc
📊 Lines of Code:

Backend TypeScript:
  8542 total

Backend JavaScript:
  2314 total

Frontend:
  1861 total
```

---

## 💡 Pro Tips

### Chain Commands

```bash
# Check config, test DB, check health
a4configtest && a4dbping && a4health

# Clean, rebuild, restart
a4clean && a4build && a4restart

# View recent errors after restart
a4restart && sleep 2 && a4errors
```

### Watch Logs While Developing

```bash
# In one terminal
a4dev

# In another terminal
a4logs
```

### Quick Debugging Flow

```bash
# 1. Check overall health
a4health

# 2. View recent errors
a4viewerrors

# 3. Test database
a4dbping

# 4. Test API
a4ping

# 5. Check configuration
a4configtest
```

### Before Deploying

```bash
# 1. Type check
a4tsc

# 2. Build
a4build

# 3. Test
a4test

# 4. Backup
a4backup

# 5. Restart
a4restart

# 6. Check health
a4health
```

---

## 🔄 Reload Aliases

After editing `.bash_aliases`, reload them:

```bash
source ~/.bash_aliases
# or
. ~/.bash_aliases
```

---

## 📋 Cheat Sheet

```bash
# Navigation
a4 a4b a4f

# Dev
a4dev a4build a4start a4test

# Logs
a4logs a4errors a4viewlogs a4viewerrors a4logsclear

# DB
a4db a4dbtest a4dbping

# Config
a4config a4configtest a4env a4envshow

# Health
a4health a4ping

# PM2
a4pm2 a4restart a4stop

# Docs
a4docs a4quickstart a4readme

# Git
a4status a4diff a4log

# Utils
a4backup a4clean a4reset a4tree a4grep a4loc
```

---

## 🆘 Troubleshooting

### Alias Not Found
```bash
# Reload aliases
source ~/.bash_aliases

# Check if defined
type a4dev
```

### Command Fails
```bash
# Check environment variables
a4envcheck

# Verify paths
echo $A4MULA_ROOT
echo $A4MULA_BACKEND

# Test database connection
a4dbping
```

### Permission Errors
```bash
# Check file permissions
ls -la $A4MULA_ROOT

# Fix if needed
chmod -R u+rw $A4MULA_BACKEND
```

---

**Happy coding! 🚀**
