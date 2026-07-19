#!/usr/bin/env bash
#
# Zero-Logging Compliance check (see CLAUDE.md).
#
# .git/hooks/pre-commit exec's this file. It was referenced by the hook and by
# CLAUDE.md but had never been committed, so the hook failed open for its entire
# life — which is plausibly how PII logging and the plaintext-answer regression
# both got committed.
#
# Scans STAGED changes only, and only lines being ADDED.
#
# The analysis deliberately strips static string literals before looking for
# forbidden identifiers, because the word "email" inside a message like
#   console.error('[gate] Email delivery failed')
# leaks nothing, while
#   console.log(`to: ${email}`)
# leaks everything. A checker that flags the first will be disabled by whoever
# hits it, and then it protects no one — so it must only fire on real leaks.
#
# Escape hatch: append `// zero-logging-ok: <reason>` to the line.

set -uo pipefail

FILES=$(git diff --cached --name-only --diff-filter=ACM \
  | grep -E '\.(ts|tsx|js|jsx|rs)$' \
  | grep -vE '^(node_modules|vendor|trash|unused-[0-9]+|_fresh)/' \
  | grep -vE '(^|/)fresh\.gen\.ts$' || true)

[ -z "$FILES" ] && exit 0

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

# Emit "file<TAB>lineno<TAB>added source line" for every added line.
for file in $FILES; do
  git diff --cached -U0 -- "$file" \
    | awk -v f="$file" '
        /^@@/ { split($3, h, ","); n = h[1]; sub(/^\+/, "", n); next }
        /^\+/ && !/^\+\+\+/ { print f "\t" n "\t" substr($0, 2); n++ }
      ' >> "$TMP"
done

[ -s "$TMP" ] || exit 0

python3 - "$TMP" <<'PY'
import re, sys

RED, YEL, GRN, OFF = '\033[0;31m', '\033[0;33m', '\033[0;32m', '\033[0m'

# Calls that actually emit somewhere a human or a disk can see.
EMITTER = re.compile(
    r'\b(console\.(log|error|warn|info|debug)|logger\.\w+|log(Auth|API|DB)\b'
    r'|tracing::\w+|println!|eprintln!|(info|warn|error|debug)!)'
)

# Things that identify a person, or fingerprint them.
PII = re.compile(
    r'\b(e?mail|ip|ipAddress|remoteAddr|remote_ip|userAgent|user_agent|cookie'
    r'|session_?[Ii]d|token|jwt|magic_?[Ll]ink|password|secret|authorization'
    r'|recipient|answer\w*|plaintext|ciphertext|q[01]_answer|body|payload)\b',
    re.I,
)

RAW_ERROR = re.compile(r',\s*(e|err|error|ex|exception)\s*[,)]')
TRUNCATED = re.compile(r'\.(substring|slice|substr)\(\s*0\s*,')


def code_only(line: str) -> str:
    """Strip static string content, keeping ${...} interpolations and real code.

    'literal text'  -> ''          (cannot leak: no interpolation in JS quotes)
    `to: ${email}`  -> ` ${email}` (the interpolation survives and is scanned)
    """
    out, i, n = [], 0, len(line)
    while i < n:
        c = line[i]
        if c in "'\"":
            i += 1
            while i < n and line[i] != c:
                i += 2 if line[i] == '\\' else 1
            i += 1  # closing quote
        elif c == '`':
            i += 1
            while i < n and line[i] != '`':
                if line[i] == '$' and i + 1 < n and line[i + 1] == '{':
                    depth, i = 1, i + 2
                    out.append(' ${')
                    while i < n and depth:
                        if line[i] == '{':
                            depth += 1
                        elif line[i] == '}':
                            depth -= 1
                            if not depth:
                                break
                        out.append(line[i])
                        i += 1
                    out.append('} ')
                    i += 1
                else:
                    i += 2 if line[i] == '\\' else 1
            i += 1
        else:
            out.append(c)
            i += 1
    return ''.join(out)


violations = []
for raw in open(sys.argv[1]):
    parts = raw.rstrip('\n').split('\t', 2)
    if len(parts) < 3:
        continue
    path, lineno, line = parts

    if 'zero-logging-ok:' in line:
        continue
    if not EMITTER.search(line):
        continue

    code = code_only(line)

    if PII.search(code):
        violations.append((path, lineno, line.strip(), 'logs a value that can identify a person'))
    elif RAW_ERROR.search(code):
        violations.append((path, lineno, line.strip(), 'logs a raw error object (may carry PII)'))
    elif TRUNCATED.search(code):
        violations.append((path, lineno, line.strip(), 'logs a truncated value — a partial token is still a fingerprint'))

if violations:
    for path, lineno, line, why in violations:
        print(f'{RED}✗ {why}{OFF}\n  {path}:{lineno}\n  {line}\n')
    print(f'{RED}Zero-logging check failed: {len(violations)} violation(s).{OFF}')
    print('See the Zero-Logging Policy in CLAUDE.md.')
    print(f'Log a category name, a boolean flag, or an {YEL}increment(){OFF} metric instead.')
    print('If a match is provably safe, append: // zero-logging-ok: <reason>')
    sys.exit(1)

print(f'{GRN}✓ zero-logging check passed{OFF}')
PY
