#!/usr/bin/env bash
#
# Zero-Logging Compliance Check
#
# Scans staged files for PII leaks in logging statements.
# Used as a pre-commit hook and CI check.
#
# Exit 0 = clean, Exit 1 = violations found
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

VIOLATIONS=0

# Patterns that indicate PII in logging
# Each pattern: "regex|||description"
PATTERNS=(
  'console\.(log|warn|error|info|debug)\(.*\bemail\b.*[`$]|||Email address logged to console'
  'console\.(log|warn|error|info|debug)\(.*\bip\b.*[`$]|||IP address logged to console'
  'console\.(log|warn|error|info|debug)\(.*\buserAgent\b|||User agent logged to console'
  'console\.(log|warn|error|info|debug)\(.*\bcookie\b|||Cookie logged to console'
  'console\.(log|warn|error|info|debug)\(.*\bsessionID\b|||Session ID logged to console'
  'console\.(log|warn|error|info|debug)\(.*\bmagicLink\b|||Magic link logged to console'
  'console\.(log|warn|error|info|debug)\(.*\btoken\b.*[`$]|||Token logged to console'
  'console\.(log|warn|error|info|debug)\(.*x-forwarded-for|||IP via header logged to console'
  'console\.(log|warn|error|info|debug)\(.*req\.headers\.cookie|||Cookie header logged'
  '\[AUTH DEBUG\]|||Debug logging left in code'
  'console\.(log|warn|error|info|debug)\(.*\brecipient\b.*[`$]|||Recipient logged to console'
  'console\.(log|warn|error|info|debug)\(.*\breq\.body|||Request body logged to console'
)

# Get files to check
if [ "${1:-}" = "--all" ]; then
  # Check all source files
  FILES=$(find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.rs" \) \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -not -path "*/dist/*" \
    -not -path "*/target/*" \
    -not -path "*/check-zero-logging.sh" \
    -not -path "*/trash/*" \
    -not -path "*/backend/*" 2>/dev/null)
else
  # Check only staged files (for pre-commit)
  FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.(ts|tsx|js|rs)$' || true)
fi

if [ -z "$FILES" ]; then
  echo -e "${GREEN}No source files to check.${NC}"
  exit 0
fi

echo -e "${YELLOW}Zero-Logging Compliance Check${NC}"
echo "================================"

for entry in "${PATTERNS[@]}"; do
  pattern="${entry%%|||*}"
  description="${entry##*|||}"

  while IFS= read -r file; do
    [ -z "$file" ] && continue
    # Skip the check script itself
    [[ "$file" == *"check-zero-logging"* ]] && continue
    # Skip test files
    [[ "$file" == *"test"* ]] && continue
    [[ "$file" == *"spec"* ]] && continue

    matches=$(grep -nE "$pattern" "$file" 2>/dev/null || true)
    if [ -n "$matches" ]; then
      while IFS= read -r match; do
        echo -e "${RED}VIOLATION${NC}: $description"
        echo "  File: $file"
        echo "  $match"
        echo ""
        VIOLATIONS=$((VIOLATIONS + 1))
      done <<< "$matches"
    fi
  done <<< "$FILES"
done

echo "================================"
if [ "$VIOLATIONS" -gt 0 ]; then
  echo -e "${RED}Found $VIOLATIONS zero-logging violation(s).${NC}"
  echo "Fix these before committing. See CLAUDE.md for logging policy."
  exit 1
else
  echo -e "${GREEN}Zero-logging compliance check passed.${NC}"
  exit 0
fi
