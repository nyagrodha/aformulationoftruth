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
 * Requires the age identity (root-readable). The Rust gate cannot decrypt; only
 * the identity holder can. That is the design.
 */

const IDENTITY = '/root/.a4t/gate-identity.txt';
const GATE_DB = '/var/lib/a4t-gate/gate.sqlite';
const REVEAL = Deno.args.includes('--reveal');

interface Row {
  session_id: string;
  question_index: number;
  question_text: string;
  ciphertext: string;
  created_at: string;
}

function sqlite(sql: string): string {
  const { stdout, success, stderr } = new Deno.Command('sqlite3', {
    args: ['-json', GATE_DB, sql],
  }).outputSync();
  if (!success) throw new Error(new TextDecoder().decode(stderr));
  return new TextDecoder().decode(stdout).trim();
}

async function decrypt(armor: string): Promise<string> {
  const child = new Deno.Command('age', {
    args: ['-d', '-i', IDENTITY],
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

const raw = sqlite(
  `SELECT session_id, question_index, question_text, ciphertext, created_at
     FROM gate_encrypted_answers ORDER BY created_at, session_id, question_index`,
);
const rows: Row[] = raw ? JSON.parse(raw) : [];

const sessions = new Set(rows.map((r) => r.session_id));
let ok = 0;
let failed = 0;

const decrypted = [];
for (const r of rows) {
  try {
    const text = await decrypt(r.ciphertext);
    ok++;
    decrypted.push({ ...r, text, error: false });
  } catch {
    failed++;
    decrypted.push({ ...r, text: '', error: true });
  }
}

console.log(`answers:  ${rows.length}`);
console.log(`sessions: ${sessions.size}`);
console.log(`decrypted with this key: ${ok}`);
if (failed) {
  console.log(
    `NOT decryptable with this key: ${failed}  ` +
      `(encrypted to the older recipient age1jwpy3l4... — needs that identity)`,
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
    console.log(`  [q${r.question_index}] <cannot decrypt with this key>`);
    continue;
  }
  const body = r.text.trim();
  console.log(`  [q${r.question_index}] ${r.question_text}`);
  console.log(`      ${body === '' ? '(skipped)' : body.replace(/\n/g, '\n      ')}`); // zero-logging-ok: offline admin CLI, prints decrypted answers only under explicit --reveal to the operator's own terminal
}
