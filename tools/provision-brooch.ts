#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --allow-run
/**
 * Provision a brooch: mint its identity on the site and write it into the
 * brooch over USB serial in one step.
 *
 *   deno run -A tools/provision-brooch.ts <wearer-email> <label> [--port /dev/ttyACM0] [--display-name NAME]
 *
 * Env: DATABASE_URL, BROOCH_KEK (base64, 32 bytes), BROOCH_ISSUER_EMAIL.
 *
 * The brooch key goes from this process straight to the serial port: never to
 * disk, stdout or shell history. The brooch answers with its counter-0 code,
 * which must verify here, or the whole transaction rolls back.
 * Spec: ~/Projects/ESP32/brooch/docs/superpowers/specs/2026-09-23-encounter-identity-design.md
 */
import { parseArgs } from '$std/cli/parse_args.ts';
import { encodeBase64Url } from '$std/encoding/base64url.ts';
import { hashEmail, randomBytes, randomToken } from '../lib/crypto.ts';
import { withTransaction } from '../lib/db.ts';
import { loadKek, wrapBroochKey } from '../lib/brooch_keys.ts';
import { encodeCode, importBroochKey } from '../lib/brooch_code.ts';

for (const envFile of ['.env.fresh', '.env']) {
  try {
    for (const line of (await Deno.readTextFile(envFile)).split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('#')) {
        const i = t.indexOf('=');
        if (i > 0) Deno.env.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
      }
    }
    break;
  } catch { /* file optional */ }
}

const args = parseArgs(Deno.args, { string: ['port', 'display-name'], default: { port: '/dev/ttyACM0' } });
const [wearerEmail, label] = args._.map(String);
if (!wearerEmail || !label) {
  console.error('usage: provision-brooch.ts <wearer-email> <label> [--port /dev/ttyACM0] [--display-name NAME]');
  Deno.exit(1);
}
const issuerEmail = Deno.env.get('BROOCH_ISSUER_EMAIL');
const kek = await loadKek();
if (!issuerEmail || !kek) {
  console.error('BROOCH_ISSUER_EMAIL and a 32-byte base64 BROOCH_KEK must be set');
  Deno.exit(1);
}

/** Put the tty in raw mode without hanging up on close (a hangup resets the brooch). */
async function configurePort(port: string) {
  const { success } = await new Deno.Command('stty', {
    args: ['-F', port, '115200', 'raw', '-echo', '-hupcl'],
  }).output();
  if (!success) throw new Error(`stty failed on ${port}`);
}

/** Send one line; return the first PROV1-OK/PROV1-ERR/ERR line, or null on timeout. */
async function exchange(port: string, line: string, timeoutMs = 6000): Promise<string | null> {
  const f = await Deno.open(port, { read: true, write: true });
  try {
    await new Promise((r) => setTimeout(r, 1500)); // if opening reset the brooch, let it boot
    await f.write(new TextEncoder().encode(line + '\n'));
    const buf = new Uint8Array(512);
    let acc = '';
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      // The read is caught: when the timer wins, closing the file rejects the
      // pending read, and an unhandled rejection would kill the process.
      const n = await Promise.race([
        f.read(buf).catch(() => null),
        new Promise<null>((r) => setTimeout(() => r(null), deadline - Date.now())),
      ]);
      if (n === null) break;
      acc += new TextDecoder().decode(buf.subarray(0, n));
      const reply = acc.split(/\r?\n/).find((l) => /^(PROV1-OK|PROV1-ERR|ERR)\b/.test(l));
      if (reply) return reply;
    }
    return null;
  } finally {
    f.close();
  }
}

await configurePort(args.port);
const keyRaw = randomBytes(32);
const key = await importBroochKey(keyRaw);
const wearerHash = await hashEmail(wearerEmail);
const issuerHash = await hashEmail(issuerEmail);

const broochId = await withTransaction(async (client) => {
  const { rows } = await client.queryObject<{ id: number }>(
    `SELECT (COALESCE(MAX(id), 0) + 1)::int4 AS id FROM fresh_brooches`,
  );
  const id = rows[0].id;
  const token = randomToken(12);
  await client.queryObject(
    `INSERT INTO fresh_wearables (token, owner_email_hash, display_name, label) VALUES ($1, $2, $3, $4)`,
    [token, wearerHash, args['display-name'] ?? null, label],
  );
  await client.queryObject(
    `INSERT INTO fresh_brooches (id, wearable_token, issuer_email_hash, wearer_email_hash, key_enc)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, token, issuerHash, wearerHash, await wrapBroochKey(keyRaw, kek)],
  );

  const idHex = id.toString(16).padStart(8, '0');
  const reply = await exchange(args.port, `PROV1 ${idHex} ${encodeBase64Url(keyRaw)}`);
  if (!reply?.startsWith('PROV1-OK ')) {
    // Throwing rolls the rows back. The reply is a status line; it never carries the key.
    throw new Error(`brooch did not accept provisioning: ${reply ?? 'no reply (is it already provisioned?)'}`); // zero-logging-ok: brooch status line, contains no key
  }
  if (reply.slice(9).trim() !== await encodeCode(key, id, 0)) {
    throw new Error('brooch self-test code does not verify; rolled back');
  }
  return id;
});

keyRaw.fill(0);
console.log(`brooch provisioned: ${label} (id ${broochId})`);
