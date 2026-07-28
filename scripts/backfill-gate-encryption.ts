/**
 * One-shot backfill: age-encrypt the plaintext gate answers that accumulated
 * in Postgres while the Rust gate was bypassed (regression, ~10 Jun 2026).
 *
 * Safety contract:
 *   1. Encrypt every plaintext answer through the gate.
 *   2. VERIFY each ciphertext decrypts back to the exact original bytes.
 *   3. Only null the plaintext columns for rows that passed step 2.
 *
 * A row that fails verification keeps its plaintext. We would rather hold PII
 * we can see than silently lose a person's answer.
 *
 * Prints counts only — never answer text.
 *
 *   deno run -A scripts/backfill-gate-encryption.ts --commit
 *
 * Without --commit it does a dry run: encrypts, verifies, nulls nothing.
 */

import { withConnection } from '../lib/db.ts';
import { GATE_QUESTIONS, storeEncryptedAnswer } from '../lib/gate_encrypt.ts';

const COMMIT = Deno.args.includes('--commit');
const IDENTITY = '/root/.a4t/gate-identity.txt';
const GATE_DB = '/var/lib/a4t-gate/gate.sqlite';

interface Row {
  gate_token: string;
  q0_answer: string | null;
  q1_answer: string | null;
}

/** Pull the stored ciphertext back out and decrypt it, to prove it round-trips. */
async function decryptStored(sessionId: string, index: number): Promise<string> {
  const sql = `SELECT ciphertext FROM gate_encrypted_answers ` +
    `WHERE session_id='${sessionId}' AND question_index=${index};`;

  const read = new Deno.Command('sqlite3', { args: [GATE_DB, sql] });
  const { stdout } = await read.output();
  const armor = new TextDecoder().decode(stdout);
  if (!armor.startsWith('-----BEGIN AGE')) throw new Error('no ciphertext stored');

  const dec = new Deno.Command('age', {
    args: ['-d', '-i', IDENTITY],
    stdin: 'piped',
    stdout: 'piped',
  });
  const child = dec.spawn();
  const w = child.stdin.getWriter();
  await w.write(new TextEncoder().encode(armor));
  await w.close();
  const out = await child.output();
  if (!out.success) throw new Error('decrypt failed');
  return new TextDecoder().decode(out.stdout);
}

const rows = await withConnection(async (client) => {
  const { rows } = await client.queryObject<Row>(
    `SELECT gate_token, q0_answer, q1_answer
       FROM fresh_gate_responses
      WHERE q0_answer IS NOT NULL OR q1_answer IS NOT NULL
      ORDER BY id`,
  );
  return rows;
});

console.log(`rows with plaintext: ${rows.length}`);
console.log(COMMIT ? 'mode: COMMIT' : 'mode: DRY RUN (nothing will be nulled)');

let encrypted = 0;
let verified = 0;
const safeToNull: string[] = [];

for (const row of rows) {
  const answers: [number, string | null][] = [[0, row.q0_answer], [1, row.q1_answer]];
  let rowOk = true;

  for (const [index, answer] of answers) {
    if (answer === null) continue;
    try {
      await storeEncryptedAnswer({
        sessionId: row.gate_token,
        questionIndex: index,
        questionText: GATE_QUESTIONS[index],
        answer,
        skipped: false,
      });
      encrypted++;

      const back = await decryptStored(row.gate_token, index);
      if (back !== answer) throw new Error('round-trip mismatch');
      verified++;
    } catch {
      // Category only. Keep this row's plaintext.
      console.error(`  FAILED q${index} on one row — plaintext retained`);
      rowOk = false;
    }
  }

  if (rowOk) safeToNull.push(row.gate_token);
}

console.log(`encrypted: ${encrypted}`);
console.log(`verified (decrypts to exact original): ${verified}`);
console.log(`rows fully verified, safe to null: ${safeToNull.length}/${rows.length}`);

if (!COMMIT) {
  console.log('\nDRY RUN — no plaintext removed. Re-run with --commit to null verified rows.');
  Deno.exit(0);
}

if (safeToNull.length === 0) {
  console.log('nothing verified; refusing to null anything');
  Deno.exit(1);
}

const nulled = await withConnection(async (client) => {
  const { rows } = await client.queryObject<{ count: bigint }>(
    `WITH upd AS (
       UPDATE fresh_gate_responses
          SET q0_answer = NULL, q1_answer = NULL
        WHERE gate_token = ANY($1)
        RETURNING 1
     )
     SELECT count(*)::bigint AS count FROM upd`,
    [safeToNull],
  );
  return Number(rows[0].count);
});

console.log(`plaintext nulled on ${nulled} rows`);
