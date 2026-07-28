#!/usr/bin/env bash
#
# Pre-commit hook: secret material must never enter the repository.
#
# This exists because the Tor onion service private key WAS committed (3 commits),
# which permanently burned that .onion address, and docker-compose.yml carried the
# live SMTP password, DB password, JWT secret and Twilio token across 8 commits.
# .gitignore alone is not enough: `git add -f` bypasses it. This blocks the commit.
#
# Escape hatch: if a match is provably safe (a fixture, a public key, a doc example),
# append the marker  # secrets-ok: <reason>  on the matching line.

set -uo pipefail

RED=$'\033[0;31m'; YEL=$'\033[0;33m'; NC=$'\033[0m'
violations=0

staged=$(git diff --cached --name-only --diff-filter=ACM)
[ -z "$staged" ] && exit 0

# ── 1. Filenames that are secret material by definition ─────────────────────
# Matched against the path, not the contents.
forbidden_paths='(^|/)(hs_ed25519_secret_key|hs_x25519_[^/]*|id_rsa|id_ed25519|acme\.json)$|\.onion/|(^|/)hidden_service[^/]*/|\.(key|pem|p12|pfx|jks)$|(^|/)\.env($|\.)'

while IFS= read -r f; do
  if printf '%s' "$f" | grep -qE "$forbidden_paths"; then
    echo "${RED}✗ secret material must not be committed${NC}"
    echo "  $f"
    violations=$((violations + 1))
  fi
done <<< "$staged"

# ── 2. Secret-looking content in otherwise ordinary files ───────────────────
# Keep patterns specific: a loose entropy check would flag every hash and hex id.
patterns=(
  'BEGIN [A-Z ]*PRIVATE KEY'                 # PEM private keys
  'SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}' # SendGrid API token
  'sk-[A-Za-z0-9]{32,}'                      # generic provider secret key
  'AKIA[0-9A-Z]{16}'                         # AWS access key id
  'xox[baprs]-[A-Za-z0-9-]{10,}'             # Slack token
  'ghp_[A-Za-z0-9]{20,}'                     # GitHub PAT
  '[A-Za-z0-9._%+-]+:[^:@/[:space:]]{8,}@[A-Za-z0-9.-]+:[0-9]+/' # user:pass@host:port/db
  '(SMTP_PASS|DB_PASSWORD|JWT_SECRET|SESSION_SECRET|TWILIO_AUTH_TOKEN|AUTH_TOKEN|API_KEY|SECRET)[[:space:]]*=[[:space:]]*["'"'"']?[A-Za-z0-9+/_.-]{12,}'
)

for f in $staged; do
  [ -f "$f" ] || continue
  # Skip this script and the lockfile: one defines the patterns, the other is noise.
  case "$f" in
    scripts/check-secrets.sh|package-lock.json|deno.lock|*.config/.semgrep/*) continue ;;
  esac

  for pat in "${patterns[@]}"; do
    while IFS=: read -r lineno line; do
      [ -z "${lineno:-}" ] && continue
      # Allow ${VAR} references and explicit opt-outs.
      printf '%s' "$line" | grep -q '\${' && continue
      printf '%s' "$line" | grep -q 'secrets-ok:' && continue
      echo "${RED}✗ hardcoded secret${NC}"
      echo "  $f:$lineno"
      violations=$((violations + 1))
    done < <(grep -nE "$pat" "$f" 2>/dev/null | head -3)
  done
done

if [ "$violations" -gt 0 ]; then
  echo
  echo "${RED}Secret check failed: $violations finding(s).${NC}"
  echo "Store the value in ${YEL}.env${NC} (gitignored) and reference it as ${YEL}\${VAR}${NC}."
  echo "If a match is provably safe, append: ${YEL}# secrets-ok: <reason>${NC}"
  exit 1
fi

exit 0
