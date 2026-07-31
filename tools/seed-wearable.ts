#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/**
 * Seed (or list) wearables.
 *
 *   deno run -A tools/seed-wearable.ts <owner-email> <label> [display-name]
 *   deno run -A tools/seed-wearable.ts --list
 *
 * Token is 16 URL-safe chars (12 random bytes) so the full QR text
 * "aformulationoftruth.com/w/<token>" stays within the 53-byte ceiling of
 * the prototype's 128x64 OLED (QR v3 @ ECC-L). Owner is stored as
 * email_hash only, like every identity in the fresh app.
 */
import { hashEmail, randomToken } from '../lib/crypto.ts';
import { withConnection } from '../lib/db.ts';

// Match migrate.ts: load env files so DATABASE_URL is present.
for (const envFile of ['.env.fresh', '.env']) {
  try {
    for (const line of (await Deno.readTextFile(envFile)).split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('#')) {
        const i = t.indexOf('=');
        if (i > 0) Deno.env.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
      }
    }
  } catch { /* file optional */ }
}

/**
 * A wearable token is a bearer credential. It is printed on a physical object,
 * it is planted as a 24h cookie by /w/:token, and it is the edge that joins a
 * scanner's account to the owner's — so anyone holding one can pose as a scan
 * of that object and graft themselves onto someone else's graph.
 *
 * The operator seeding a wearable genuinely needs to read the token: making
 * the QR is the entire point of running this. So the rule is not "never
 * print it" but "print it only where a person is looking". Writing it to a
 * terminal is safe; writing it to a pipe, a file, a CI capture, or a systemd
 * journal is the leak the zero-logging policy exists to prevent — and which
 * of those it is, is knowable at runtime.
 */
const attended = Deno.stdout.isTerminal();

function reveal(caption: string, secret: string): void {
  if (!attended) {
    console.log(`${caption}: <withheld — re-run attached to a terminal to reveal>`);
    return;
  }
  console.log(`${caption}: ${secret}`); // zero-logging-ok: TTY-gated above, cannot reach a captured stream
}

if (Deno.args[0] === '--list') {
  const rows = await withConnection(async (c) =>
    (await c.queryObject<{
      token: string;
      label: string;
      display_name: string | null;
      share_owner_responses: boolean;
      created_at: Date;
    }>(
      `SELECT token, label, display_name, share_owner_responses, created_at
         FROM fresh_wearables ORDER BY created_at`,
    )).rows
  );
  // Dumping every token at once is the bulk form of the same leak, so the
  // column is present only for an attended terminal.
  if (attended) {
    console.table(rows); // zero-logging-ok: TTY-gated, token column withheld otherwise
  } else {
    console.table(rows.map(({ token: _token, ...rest }) => rest));
    console.log('(token column withheld — re-run attached to a terminal to reveal)');
  }
  Deno.exit(0);
}

const [ownerEmail, label, displayName] = Deno.args;
if (!ownerEmail || !label) {
  console.error('usage: seed-wearable.ts <owner-email> <label> [display-name]');
  Deno.exit(1);
}

const token = randomToken(12); // 16 url-safe chars
const ownerHash = await hashEmail(ownerEmail);

await withConnection(async (c) => {
  await c.queryObject(
    `INSERT INTO fresh_wearables (token, owner_email_hash, display_name, label)
     VALUES ($1, $2, $3, $4)`,
    [token, ownerHash, displayName ?? null, label],
  );
});

console.log(`wearable seeded: ${label}`);
reveal('token', token);
reveal('QR text', `aformulationoftruth.com/w/${token}`);
