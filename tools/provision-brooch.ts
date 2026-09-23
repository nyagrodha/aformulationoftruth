#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --allow-run
/**
 * Provision a brooch: mint its identity on the site and write it into the
 * brooch over USB serial in one step.
 *
 *   deno run -A tools/provision-brooch.ts <wearer-email> <label> --port <path> [--display-name NAME]
 *
 * --port is required (no default): prefer a /dev/serial/by-id/... path over
 * /dev/ttyACM0 -- the ttyACM number can silently point at the wrong board
 * when more than one is attached. This tool prints which by-id entry (if
 * any) resolves to the port you gave before it writes anything.
 *
 * Env: DATABASE_URL, BROOCH_KEK (base64, 32 bytes), BROOCH_ISSUER_EMAIL.
 *
 * The brooch key goes from this process straight to the serial port: never to
 * disk, stdout or shell history. The brooch answers with its counter-0 code,
 * which must verify here, or the whole transaction rolls back. If the brooch
 * ever answers PROV1-OK before the verify or the commit, the key is on the
 * brooch even though the rollback undoes the site's rows -- see
 * printRecoveryHint() below.
 * Spec: ~/Projects/ESP32/brooch/docs/superpowers/specs/2026-09-23-encounter-identity-design.md
 */
import { parseArgs } from '$std/cli/parse_args.ts';
import { encodeBase64Url } from '$std/encoding/base64url.ts';
import { hashEmail, randomBytes, randomToken } from '../lib/crypto.ts';
import { withTransaction } from '../lib/db.ts';
import { loadKek, wrapBroochKey } from '../lib/brooch_keys.ts';
import { encodeCode, importBroochKey } from '../lib/brooch_code.ts';

/**
 * From accumulated serial input, the first COMPLETE reply line, or null if no
 * complete line matches yet. "Complete" means everything up to (not
 * including) the last newline seen so far -- text after that point might be
 * the front half of a line still arriving. Matching into that unterminated
 * tail is what let a PROV1-OK split across two reads (e.g. "PROV1-OK Ck8A"
 * then the rest) read as a short, non-matching line: the code-comparison
 * check would then fail and roll back the site's rows while the brooch had
 * already stored the key. Pure and exported for tests.
 */
export function findReplyLine(acc: string): string | null {
  const lastNewline = acc.lastIndexOf('\n');
  if (lastNewline < 0) return null; // nothing terminated yet
  // Slice up to and including that '\n' -- not just up to it -- so a
  // trailing "\r" stays paired with it and /\r?\n/ strips the whole CRLF
  // rather than leaving a stray "\r" stuck to the end of the last line.
  for (const l of acc.slice(0, lastNewline + 1).split(/\r?\n/)) {
    if (/^(PROV1-OK|PROV1-ERR|ERR)\b/.test(l)) return l;
  }
  return null;
}

/**
 * A reply is safe to print only if it is exactly one of the brooch's short
 * status shapes and carries nothing that could be key material -- in
 * particular no run of 30+ base64url characters (K_brooch base64url-encodes
 * to 43 chars; an encounter code is 27). Anything else, including a faulty
 * echo of the PROV1 line we sent (which starts "PROV1 ", not "PROV1-ERR" or
 * "PROV1-OK"), is withheld rather than guessed at. Pure and exported for
 * tests. `null` means the exchange timed out with no reply at all.
 */
export function sanitizeReply(reply: string | null): string {
  if (reply === null) {
    return 'no reply (wrong port, different firmware, or another process holding the port; ' +
      'an already-provisioned brooch answers PROV1-ERR)';
  }
  const isShortStatus = /^(PROV1-ERR|ERR) [ -~]{1,80}$/.test(reply);
  const looksLikeKeyMaterial = /[A-Za-z0-9_-]{30,}/.test(reply);
  return isShortStatus && !looksLikeKeyMaterial ? reply : '(unrecognised reply withheld)';
}

/** Put the tty in raw mode without hanging up on close (a hangup resets the brooch). */
async function configurePort(port: string): Promise<void> {
  const { success } = await new Deno.Command('stty', {
    args: ['-F', port, '115200', 'raw', '-echo', '-hupcl'],
  }).output();
  if (!success) throw new Error(`stty failed on ${port}`);
}

/**
 * Best-effort: says which /dev/serial/by-id/* symlink (if any) resolves to
 * the port the operator gave, printed to stdout before anything is written.
 * A host or environment with no udev by-id links is expected, not an error,
 * so the fallback is a warning rather than a thrown failure.
 */
async function identifyPort(port: string): Promise<void> {
  let resolved: string;
  try {
    resolved = await Deno.realPath(port);
  } catch {
    console.error(`warning: could not resolve ${port} -- device identity not confirmed`);
    return;
  }
  let match: string | null = null;
  try {
    for await (const entry of Deno.readDir('/dev/serial/by-id')) {
      const candidate = `/dev/serial/by-id/${entry.name}`;
      try {
        if (await Deno.realPath(candidate) === resolved) {
          match = entry.name;
          break;
        }
      } catch { /* broken symlink; keep looking */ }
    }
  } catch { /* no /dev/serial/by-id on this host */ }
  if (match) {
    console.log(`writing to ${match} (${resolved})`);
  } else {
    console.error(`warning: no /dev/serial/by-id entry matches ${resolved} -- device identity could not be confirmed`);
  }
}

/**
 * Printed once the PROV1 line has actually been written to the brooch and
 * something then goes wrong -- timeout, PROV1-ERR/ERR, a code that doesn't
 * verify, or the site's COMMIT itself failing. In every one of those cases
 * the brooch may have already stored the key while the site's rows roll
 * back, so the two sides need to be re-synced by hand before trying again.
 */
function printRecoveryHint(port: string): void {
  console.error(
    'The brooch may now hold a key the site does not have. To reset it: close any serial ' +
      `monitor, then run \`esptool --port ${port} --chip esp32c5 erase-region 0x9000 0x5000\` ` +
      "(this erases the brooch's identity AND its stored Wi-Fi networks; re-add them with " +
      'tools/send-wifi.py), then run this tool again.',
  );
}

/**
 * Runs `fn`, and guarantees `cleanup` runs before this returns -- on success,
 * on a thrown error (in which case `onError` runs first), or on both. This
 * exists because `try { ... } catch { ...; Deno.exit(1); } finally { cleanup() }`
 * never reaches the finally: `Deno.exit()` terminates the process immediately,
 * so cleanup (zeroing the key buffer, here) silently never ran on exactly the
 * failure paths that most need it. Setting `Deno.exitCode` instead of calling
 * `Deno.exit()` inside `onError`, and letting this function return normally,
 * is what lets `finally` -- and therefore `cleanup` -- actually execute.
 * Pure aside from calling the three functions it's given; exported for tests.
 */
export async function runGuarded<T>(
  fn: () => Promise<T>,
  onError: (err: unknown) => void,
  cleanup: () => void,
): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    onError(err);
    return { ok: false };
  } finally {
    cleanup();
  }
}

/** Send one line; return the first PROV1-OK/PROV1-ERR/ERR line, or null on timeout. */
async function exchange(
  port: string,
  line: string,
  markWritten: () => void,
  timeoutMs = 6000,
): Promise<string | null> {
  const f = await Deno.open(port, { read: true, write: true });
  try {
    await new Promise((r) => setTimeout(r, 1500)); // if opening reset the brooch, let it boot
    await f.write(new TextEncoder().encode(line + '\n'));
    markWritten(); // from here on, the brooch may already have the key
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
      const reply = findReplyLine(acc);
      if (reply) return reply;
    }
    return null;
  } finally {
    f.close();
  }
}

async function main() {
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

  const args = parseArgs(Deno.args, { string: ['port', 'display-name'] });
  const [wearerEmail, label] = args._.map(String);
  if (!wearerEmail || !label || !args.port) {
    console.error('usage: provision-brooch.ts <wearer-email> <label> --port <path> [--display-name NAME]');
    console.error(
      '  --port is required (no default). Prefer a /dev/serial/by-id/... path over /dev/ttyACM0 -- ' +
        'the ttyACM number can silently point at the wrong board when more than one is attached.',
    );
    Deno.exit(1);
  }
  // Captured as its own const so the narrowing from the check above (string,
  // never undefined) survives into the closure passed to withTransaction()
  // below -- TypeScript does not carry a property narrowing like `args.port`
  // across a function boundary, only a variable's own narrowed type.
  const port: string = args.port;
  const issuerEmail = Deno.env.get('BROOCH_ISSUER_EMAIL');
  const kek = await loadKek();
  if (!issuerEmail || !kek) {
    console.error('BROOCH_ISSUER_EMAIL and a 32-byte base64 BROOCH_KEK must be set');
    Deno.exit(1);
  }

  await identifyPort(port);

  let keyWritten = false;
  let keyRaw: Uint8Array<ArrayBuffer> | null = null;

  const result = await runGuarded(
    async () => {
      await configurePort(port);
      keyRaw = randomBytes(32);
      const key = await importBroochKey(keyRaw);
      const wearerHash = await hashEmail(wearerEmail);
      const issuerHash = await hashEmail(issuerEmail);

      return await withTransaction(async (client) => {
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
          [id, token, issuerHash, wearerHash, await wrapBroochKey(keyRaw!, kek)],
        );

        const idHex = id.toString(16).padStart(8, '0');
        const reply = await exchange(
          port,
          `PROV1 ${idHex} ${encodeBase64Url(keyRaw!)}`,
          () => {
            keyWritten = true;
          },
        );
        if (!reply?.startsWith('PROV1-OK ')) {
          // Throwing rolls the rows back. sanitizeReply() never lets the raw
          // reply through unless it is already known to be a short status line.
          throw new Error(`brooch did not accept provisioning: ${sanitizeReply(reply)}`);
        }
        if (reply.slice(9).trim() !== await encodeCode(key, id, 0)) {
          throw new Error('brooch self-test code does not verify; rolled back');
        }
        return id;
      });
    },
    (err) => {
      // Deno.exitCode, not Deno.exit(): the latter terminates the process
      // before runGuarded's finally (cleanup, below) can zero the key buffer.
      if (keyWritten) printRecoveryHint(port);
      console.error(`provisioning failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      Deno.exitCode = 1;
    },
    () => keyRaw?.fill(0),
  );

  if (result.ok) {
    console.log(`brooch provisioned: ${label} (id ${result.value})`);
  }
}

if (import.meta.main) {
  await main();
  // Some pending handle (the postgres pool, a timer) can otherwise keep the
  // event loop alive past main() returning; force the process to actually
  // exit with whatever code the run settled on. This runs after main()'s
  // internal finally, so it never races the key-zeroing cleanup above.
  Deno.exit(Deno.exitCode);
}
