/**
 * Encryption & Transport Audit — executable guardrails
 *
 * Static, offline assertions that encode the project's mandatory encryption
 * invariants (CLAUDE.md → "User Input Encryption" and "Zero-Logging Policy").
 * These run without a database, the Fresh server, or the Rust gate:
 *
 *   deno test --allow-read tests/throughput/encryption_audit_test.ts
 *
 * The goal is to fail the build if a future change reintroduces plaintext PII
 * at rest, a plaintext `email` column, a plaintext fallback in the gate client,
 * or PII in logs. It is the "at rest / pre-transport" half of the throughput
 * audit; the live end-to-end walk lives in journey_test.ts.
 */

import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const repoRoot = new URL('../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, repoRoot));

async function readDir(rel: string): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of Deno.readDir(new URL(rel, repoRoot))) {
    if (entry.isFile) out.push(`${rel}${entry.name}`);
  }
  return out.sort();
}

/**
 * Recursively collect .ts/.tsx source files under a directory, skipping build
 * output and generated manifests.
 */
async function collectSources(rel: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string) => {
    for await (const entry of Deno.readDir(new URL(dir, repoRoot))) {
      const path = `${dir}${entry.name}`;
      if (entry.isDirectory) {
        if (entry.name === '_fresh' || entry.name === 'node_modules') continue;
        await walk(`${path}/`);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        out.push(path);
      }
    }
  };
  await walk(rel);
  return out.sort();
}

// ---------------------------------------------------------------------------
// (A) Schema invariant: no plaintext email / phone / ip column at rest
// ---------------------------------------------------------------------------

// A column declaration is "<name> <TYPE>" at the start of a trimmed line.
// Banned bare names; allowed only as *_hash or encrypted_* variants.
const BANNED_COLUMN =
  /^\s*(email|phone|ip_address|ip|user_agent|useragent|cookie|session_token|magic_link)\s+(text|varchar|citext|char|inet|json|jsonb)/i;

// Legacy Express-era migrations that still declare plaintext `email` columns on
// the `production` branch. CLAUDE.md documents that these were converted to
// tombstones (DROP TABLE) on 2026-07-14, but that conversion is not yet
// committed to this branch. They have no live caller (the app uses the fresh_*
// schema), but replaying them against a fresh DB would create plaintext-PII
// columns. Reported as a finding; allow-listed here so the suite blocks any
// NEW plaintext migration while this known debt is paid down.
const KNOWN_PENDING_TOMBSTONE = new Set([
  'db/migrations/001_initial_schema.sql',
  'db/migrations/002_magic_links.sql',
]);

async function migrationsWithPlaintextPII(): Promise<string[]> {
  const files = (await readDir('db/migrations/')).filter((f) => f.endsWith('.sql'));
  assert(files.length > 0, 'expected db/migrations/*.sql to exist');
  const offenders: string[] = [];
  for (const file of files) {
    const sql = await read(file);
    const isTombstone = /DROP\s+TABLE/i.test(sql);
    if (isTombstone) continue; // tombstones only drop legacy tables
    if (sql.split('\n').some((line) => BANNED_COLUMN.test(line))) offenders.push(file);
  }
  return offenders.sort();
}

Deno.test('schema: the live fresh_* schema declares no plaintext PII column', async () => {
  // Defense in depth: the schema the running app actually uses must be clean.
  const sql = await read('db/migrations/001_deno_fresh_schema.sql');
  for (const line of sql.split('\n')) {
    assert(
      !BANNED_COLUMN.test(line),
      `live fresh_* schema declares a plaintext PII column → "${line.trim()}"`,
    );
  }
});

Deno.test('schema: no NEW plaintext-PII migration beyond the known legacy set', async () => {
  const offenders = await migrationsWithPlaintextPII();
  const unexpected = offenders.filter((f) => !KNOWN_PENDING_TOMBSTONE.has(f));
  assertEquals(
    unexpected,
    [],
    'a migration declares a plaintext PII column and is not a known tombstone-pending file. ' +
      'Persist only *_hash (SHA-256) or encrypted_* (AES-256-GCM):\n' + unexpected.join('\n'),
  );
});

// ---------------------------------------------------------------------------
// (B) The gate client is the ONLY answer-text sink, and it fails closed
// ---------------------------------------------------------------------------

Deno.test('gate client: age-encrypts and fails closed with no plaintext fallback', async () => {
  const src = await read('lib/gate_encrypt.ts');

  // Sends answer text only to the gate over loopback.
  assertStringIncludes(src, '/api/store', 'gate client must POST to the gate /api/store');
  assertStringIncludes(src, 'storeEncryptedAnswer', 'gate client must export storeEncryptedAnswer');

  // Fails closed: throws on unreachable AND on non-2xx, never returns silently.
  const throws = src.match(/throw new GateUnavailableError/g) ?? [];
  assert(throws.length >= 2, 'gate client must throw on both unreachable and rejected');

  // Must never touch the database itself (no plaintext fallback persistence).
  for (const forbidden of ['queryObject', 'withConnection', 'INSERT INTO']) {
    assert(
      !src.includes(forbidden),
      `gate client must not write to the DB (found "${forbidden}") — a DB write here is a plaintext fallback`,
    );
  }
});

// ---------------------------------------------------------------------------
// (C) gate-submit routes answers through the gate and stores NULL, not text
// ---------------------------------------------------------------------------

Deno.test('gate-submit: encrypts answers via gate, persists NULL answer columns', async () => {
  const src = await read('routes/api/gate-submit.ts');

  assertStringIncludes(src, 'storeEncryptedAnswer', 'gate-submit must encrypt answers through the gate');
  assertStringIncludes(src, 'hashEmail', 'gate-submit must hash the email before any persistence');

  // The fresh_gate_responses insert must write NULL for the answer columns and
  // must not bind the raw answer text into that INSERT.
  const insertIdx = src.indexOf('fresh_gate_responses');
  assert(insertIdx !== -1, 'expected an insert into fresh_gate_responses');
  const insertRegion = src.slice(insertIdx, insertIdx + 400);
  // The answer columns must be written as literal NULL, not bound parameters.
  assert(
    /VALUES\s*\(\s*\$1\s*,\s*NULL\s*,\s*NULL\s*\)/i.test(insertRegion),
    'fresh_gate_responses insert must be VALUES ($1, NULL, NULL) — answers live encrypted in the gate, not this table',
  );
  // Only one bound parameter (the gate token); no answer text is bound.
  const placeholders = new Set(insertRegion.match(/\$\d+/g) ?? []);
  assertEquals(
    placeholders.size,
    1,
    'fresh_gate_responses insert must bind exactly one parameter (gate_token); binding more risks leaking answer text',
  );
});

// ---------------------------------------------------------------------------
// (D) Email is hashed at every ingress; hashEmail is SHA-256 of normalized input
// ---------------------------------------------------------------------------

Deno.test('email: hashed (SHA-256) at ingress, never persisted in plaintext', async () => {
  const crypto = await read('lib/crypto.ts');
  assertStringIncludes(crypto, "digest('SHA-256'", 'hashEmail must use SHA-256');
  assertStringIncludes(crypto, 'toLowerCase().trim()', 'hashEmail must normalize before hashing');

  for (
    const route of [
      'routes/api/gate-submit.ts',
      'routes/api/auth/magic-link.ts',
    ]
  ) {
    const src = await read(route);
    assertStringIncludes(src, 'hashEmail', `${route} must hash the email at ingress`);
  }
});

// ---------------------------------------------------------------------------
// (E) D-1 regression guard: /api/responses must never store plaintext answers
// ---------------------------------------------------------------------------

Deno.test('responses endpoint: no plaintext answer sink (D-1 fixed)', async () => {
  const src = await read('routes/api/responses.ts');

  // The retired endpoint must touch NO database and run NO query — any DB access
  // here would be the plaintext-answer sink this fix closed (D-1).
  for (const forbidden of ['INSERT INTO', 'withConnection', 'queryObject']) {
    assert(
      !new RegExp(forbidden, 'i').test(src),
      `routes/api/responses.ts must not access the DB (found "${forbidden}") — that path stored PLAINTEXT answers (D-1)`,
    );
  }

  // It must fail closed instead.
  assertStringIncludes(src, '410', 'retired responses endpoint should fail closed with 410 Gone');
});

// ---------------------------------------------------------------------------
// (F) Zero-logging: no live code interpolates plaintext PII into a console call
// ---------------------------------------------------------------------------

Deno.test('logging: no plaintext PII interpolated into console.* (live code)', async () => {
  const dirs = ['routes/', 'lib/', 'islands/'];
  const sources: string[] = [];
  for (const dir of dirs) sources.push(...(await collectSources(dir)));

  // Banned identifiers interpolated directly into a template inside a console call.
  const banned = [
    'email',
    'answer',
    'answer1',
    'answer2',
    'token',
    'password',
    'secret',
    'magicLink',
    'magic_link',
    'recipient',
    'cookie',
    'ipAddress',
    'userAgent',
  ];
  const consoleCall = /console\.(log|error|warn|info|debug)\s*\(([\s\S]*?)\);/g;
  const violations: string[] = [];

  for (const file of sources) {
    // Test files legitimately construct sample emails; skip them.
    if (/_test\.ts$|\.test\.ts$|\.spec\.ts$/.test(file)) continue;
    const src = await read(file);
    for (const m of src.matchAll(consoleCall)) {
      const args = m[2];
      for (const id of banned) {
        // ${id} or ${id.something} interpolated into a logged string.
        const re = new RegExp('\\$\\{\\s*' + id + '\\b', 'i');
        if (re.test(args)) {
          violations.push(`${file}: console.${m[1]} interpolates \${${id}}`);
        }
      }
    }
  }

  assertEquals(
    violations,
    [],
    'plaintext PII must never be interpolated into a log statement:\n' + violations.join('\n'),
  );
});

// ---------------------------------------------------------------------------
// (G) Client island claims must match reality (no false "encrypted" promise
//     that would let plaintext ship without protection)
// ---------------------------------------------------------------------------

Deno.test('transport: gate answers reach the server only via the encrypting path', async () => {
  // The live landing form posts to /api/gate-submit, whose handler is the only
  // place answer text is accepted, and it immediately routes through the gate.
  const index = await read('routes/index.tsx');
  assertStringIncludes(index, '/api/gate-submit', 'landing form must post to the encrypting gate-submit endpoint');

  const submit = await read('routes/api/gate-submit.ts');
  // Answer text must not be forwarded anywhere except storeEncryptedAnswer.
  assert(
    !/fetch\((?![^)]*storeEncryptedAnswer)[^)]*answer/i.test(submit),
    'gate-submit must not forward answer text to any endpoint other than the gate client',
  );
});
