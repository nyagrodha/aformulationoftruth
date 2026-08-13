/**
 * Decrypt and display stored gate answers. Operator tool — run it yourself.
 *
 *   sudo deno run -A scripts/read-gate-answers.ts            # summary, no content
 *   sudo deno run -A scripts/read-gate-answers.ts --reveal   # full plaintext
 *
 * Run this in a terminal on the box. Do NOT pipe its output into a chat, an
 * issue, a paste site, or any log — the answers are exactly the material the
 * gate form promises is never shared with a third party. `--reveal` prints
 * intimate disclosures from real people; treat the terminal as the boundary.
 *
 * Requires the age identities (root-readable). The Rust gate cannot decrypt;
 * only the identity holder can. That is the design.
 *
 * The gate recipient has been rotated more than once, so the table holds
 * ciphertext from several key eras and no single identity opens all of it.
 * Every *.txt in IDENTITY_DIR is tried, newest first. Keys kept outside that
 * directory can be added without moving them:
 *
 *   sudo A4T_IDENTITIES=/etc/rsyslog.d/AGE deno run -A scripts/read-gate-answers.ts
 *
 * Answers live in Postgres (`gate_encrypted_answers`), where the Rust gate has
 * written them since the store was consolidated. DATABASE_URL must be set:
 *
 *   set -a; . rust-server/.env; set +a
 *
 * `--legacy-sqlite` reads the pre-consolidation SQLite file instead. That file
 * still holds answers from 2026-05-17 to 2026-08-01 that were never migrated.
 */

const IDENTITY_DIR = '/root/.a4t';
const LEGACY_SQLITE_DB = '/var/lib/a4t-gate/gate.sqlite';
const REVEAL = Deno.args.includes('--reveal');
const LEGACY = Deno.args.includes('--legacy-sqlite');

interface Row {
  session_id: string;
  question_index: number;
  question_text: string;
  ciphertext: string;
  created_at: string;
}

interface Identity {
  path: string;
  label: string;
}

/**
 * Collect every identity we can read: the *.txt files in IDENTITY_DIR plus any
 * colon-separated paths in A4T_IDENTITIES. Newest first, so the current key
 * usually hits on the first try and no further `age` process is spawned.
 */
function loadIdentities(): Identity[] {
  const seen = new Set<string>();
  const found: { path: string; mtime: number }[] = [];

  const add = (path: string, onError: (msg: string) => void) => {
    if (seen.has(path)) return;
    try {
      const st = Deno.statSync(path);
      if (!st.isFile) return;
      seen.add(path);
      found.push({ path, mtime: st.mtime?.getTime() ?? 0 });
    } catch (e) {
      onError((e as Error).message);
    }
  };

  try {
    for (const entry of Deno.readDirSync(IDENTITY_DIR)) {
      if (!entry.name.endsWith('.txt')) continue;
      const path = `${IDENTITY_DIR}/${entry.name}`;
      add(path, (msg) => console.error(`skipping ${path}: ${msg}`));
    }
  } catch (e) {
    console.error(`cannot read ${IDENTITY_DIR}: ${(e as Error).message}`);
  }

  for (const extra of (Deno.env.get('A4T_IDENTITIES') ?? '').split(':')) {
    if (extra) add(extra, (msg) => console.error(`skipping ${extra}: ${msg}`));
  }

  found.sort((a, b) => b.mtime - a.mtime);
  return found.map(({ path }) => ({ path, label: path.split('/').pop()! }));
}

function sqlite(sql: string): string {
  const { stdout, success, stderr } = new Deno.Command('sqlite3', {
    args: ['-json', LEGACY_SQLITE_DB, sql],
  }).outputSync();
  if (!success) throw new Error(new TextDecoder().decode(stderr));
  return new TextDecoder().decode(stdout).trim();
}

/** Shell out to psql for the same reason we shell out to sqlite3 and age: this
 * is an operator tool, and a driver dependency buys nothing here. */
function pg(sql: string): string {
  const url = Deno.env.get('DATABASE_URL');
  if (!url) {
    throw new Error(
      'DATABASE_URL not set — run `set -a; . rust-server/.env; set +a` first, ' +
        'or pass --legacy-sqlite to read the pre-consolidation store.',
    );
  }
  const { stdout, success, stderr } = new Deno.Command('psql', {
    args: [url, '-At', '-c', sql],
  }).outputSync();
  if (!success) throw new Error(new TextDecoder().decode(stderr));
  return new TextDecoder().decode(stdout).trim();
}

async function decrypt(armor: string, identity: string): Promise<string> {
  const child = new Deno.Command('age', {
    args: ['-d', '-i', identity],
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'null',
  }).spawn();

  // The write must be awaited and the stdin closed before collecting output —
  // age blocks until it sees EOF. (An earlier version used outputSync() on the
  // spawned child, which reported every row as undecryptable and briefly looked
  // like total data loss. It was not.)
  const w = child.stdin.getWriter();
  await w.write(new TextEncoder().encode(armor));
  await w.close();

  const out = await child.output();
  if (!out.success) throw new Error('decrypt failed — wrong key?');
  return new TextDecoder().decode(out.stdout);
}

const IDENTITIES = loadIdentities();
if (IDENTITIES.length === 0) {
  console.error(
    `no readable age identity found in ${IDENTITY_DIR} — run as root, or set ` +
      `A4T_IDENTITIES to a colon-separated list of identity files.`,
  );
  Deno.exit(1);
}

const COLUMNS = 'session_id, question_index, question_text, ciphertext, created_at';
const ORDER = 'ORDER BY created_at, session_id, question_index';

const raw = LEGACY
  ? sqlite(`SELECT ${COLUMNS} FROM gate_encrypted_answers ${ORDER}`)
  : pg(
    `SELECT COALESCE(json_agg(row_to_json(t)), '[]') FROM
       (SELECT ${COLUMNS} FROM gate_encrypted_answers ${ORDER}) t`,
  );
const rows: Row[] = raw ? JSON.parse(raw) : [];

const sessions = new Set(rows.map((r) => r.session_id));
const byIdentity = new Map<string, number>();
let ok = 0;
let failed = 0;

const decrypted = [];
for (const r of rows) {
  let text: string | null = null;
  let usedBy = '';
  for (const id of IDENTITIES) {
    try {
      text = await decrypt(r.ciphertext, id.path);
      usedBy = id.label;
      break;
    } catch {
      // Wrong key era for this row — fall through to the next identity.
    }
  }

  if (text === null) {
    failed++;
    decrypted.push({ ...r, text: '', error: true });
    continue;
  }
  ok++;
  byIdentity.set(usedBy, (byIdentity.get(usedBy) ?? 0) + 1);
  decrypted.push({ ...r, text, error: false });
}

console.log(`source:     ${LEGACY ? LEGACY_SQLITE_DB : 'postgres gate_encrypted_answers'}`);
console.log(`answers:    ${rows.length}`);
console.log(`sessions:   ${sessions.size}`);
console.log(`identities: ${IDENTITIES.map((i) => i.label).join(', ')}`);
console.log(`decrypted:  ${ok}`);
for (const [label, n] of byIdentity) {
  console.log(`    ${label}: ${n}`);
}
if (failed) {
  console.log(
    `NOT decryptable with any available identity: ${failed}  ` +
      `(the matching key is missing — add it to ${IDENTITY_DIR} or A4T_IDENTITIES)`,
  );
}

if (!REVEAL) {
  console.log('\nRun with --reveal to print the answers. Keep the output on this machine.');
  Deno.exit(0);
}

console.log('\n--- answers ---\n');
let current = '';
for (const r of decrypted) {
  if (r.session_id !== current) {
    current = r.session_id;
    console.log(`\n=== session ${r.session_id}  (${r.created_at}) ===`); // zero-logging-ok: offline admin CLI, prints only under explicit --reveal to the operator's own terminal
  }
  if (r.error) {
    console.log(`  [q${r.question_index}] <cannot decrypt with any available identity>`);
    continue;
  }
  const body = r.text.trim();
  console.log(`  [q${r.question_index}] ${r.question_text}`);
  console.log(`      ${body === '' ? '(skipped)' : body.replace(/\n/g, '\n      ')}`); // zero-logging-ok: offline admin CLI, prints decrypted answers only under explicit --reveal to the operator's own terminal
}
