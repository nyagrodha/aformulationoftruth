/**
 * Brooch encounters: the database side. Pure rules live in brooch_code.ts and
 * brooch_policy.ts; this file only fetches, locks and writes.
 *
 * Concurrency: acceptEncounter takes a row lock on the brooch (FOR UPDATE), so
 * two phones scanning one QR at the same instant serialise -- the first inserts
 * the encounter, the second finds it and is "grace". That is the spec's
 * "concurrent scans cannot both win", by lock rather than by conditional UPDATE.
 *
 * Zero-logging: codes, keys and hashes are never logged; outcomes are metrics.
 */
import { withConnection as realWithConnection, withTransaction as realWithTransaction } from './db.ts';
import { sha256 } from './crypto.ts';
import { increment } from './metrics.ts';
import { parseCode, type ParsedCode, verifyCode } from './brooch_code.ts';
import { type CodeState, codeState, decideEncounter } from './brooch_policy.ts';
import { loadKek, unwrapBroochKey } from './brooch_keys.ts';

/** Test seam, as in routes/api/gate-submit.ts. */
export const dbForTesting: {
  withConnection?: typeof realWithConnection;
  withTransaction?: typeof realWithTransaction;
} = {};
const withConnection: typeof realWithConnection = (h) => (dbForTesting.withConnection ?? realWithConnection)(h);
const withTransaction: typeof realWithTransaction = (h) => (dbForTesting.withTransaction ?? realWithTransaction)(h);

type Client = Parameters<Parameters<typeof realWithConnection>[0]>[0];

interface Verified {
  parsed: ParsedCode;
  lastCounter: number;
  wearableToken: string;
}

async function loadVerified(client: Client, code: string, lock: boolean): Promise<Verified | null> {
  const parsed = parseCode(code);
  if (!parsed) return null;
  const kek = await loadKek();
  if (!kek) {
    increment('errors.config.brooch_kek_missing');
    return null;
  }
  const { rows } = await client.queryObject<{ key_enc: string; last_counter: bigint; wearable_token: string }>(
    `SELECT key_enc, last_counter, wearable_token FROM fresh_brooches
      WHERE id = $1 AND revoked_at IS NULL${lock ? ' FOR UPDATE' : ''}`,
    [parsed.broochId],
  );
  const row = rows[0];
  if (!row) return null;
  const key = await unwrapBroochKey(row.key_enc, kek);
  if (!key || !(await verifyCode(key, parsed))) return null;
  return { parsed, lastCounter: Number(row.last_counter), wearableToken: row.wearable_token };
}

/** Honour a scanned code, recording it if new. Null means: render the uniform 404. */
export async function acceptEncounter(
  code: string,
  now: Date = new Date(),
): Promise<{ wearableToken: string; codeHash: string } | null> {
  return await withTransaction(async (client) => {
    const v = await loadVerified(client, code, true);
    if (!v) {
      increment('brooch.encounter.reject');
      return null;
    }
    const codeHash = await sha256(code);
    const { rows } = await client.queryObject<{ first_seen: Date }>(
      `SELECT first_seen FROM fresh_encounter_codes WHERE code_hash = $1`,
      [codeHash],
    );
    const decision = decideEncounter({
      counter: v.parsed.counter,
      lastCounter: v.lastCounter,
      firstSeen: rows[0]?.first_seen ?? null,
      now,
    });
    increment(`brooch.encounter.${decision}`);
    if (decision === 'reject') return null;
    if (decision === 'new') {
      await client.queryObject(
        `INSERT INTO fresh_encounter_codes (code_hash, brooch_id, counter) VALUES ($1, $2, $3)`,
        [codeHash, v.parsed.broochId, v.parsed.counter],
      );
      await client.queryObject(
        `UPDATE fresh_brooches SET last_counter = $2 WHERE id = $1`,
        [v.parsed.broochId, v.parsed.counter],
      );
    }
    return { wearableToken: v.wearableToken, codeHash };
  });
}

/** For the brooch's poll. Null means: 404 (malformed, forged, revoked, or no KEK). */
export async function codeStatus(code: string): Promise<CodeState | null> {
  return await withConnection(async (client) => {
    const v = await loadVerified(client, code, false);
    if (!v) return null;
    const { rows } = await client.queryObject<{ first_seen: Date }>(
      `SELECT first_seen FROM fresh_encounter_codes WHERE code_hash = $1`,
      [await sha256(code)],
    );
    return codeState({ counter: v.parsed.counter, lastCounter: v.lastCounter, exists: rows.length > 0 });
  });
}

/** Called from gate-submit: who continued past this encounter. First writer wins. */
export async function stampScanner(codeHash: string, emailHash: string): Promise<void> {
  await withConnection(async (client) => {
    await client.queryObject(
      `UPDATE fresh_encounter_codes SET scanner_email_hash = $2
        WHERE code_hash = $1 AND scanner_email_hash IS NULL`,
      [codeHash, emailHash],
    );
  });
}
