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

if (Deno.args[0] === '--list') {
  const rows = await withConnection(async (c) =>
    (await c.queryObject(
      `SELECT token, label, display_name, share_owner_responses, created_at
         FROM fresh_wearables ORDER BY created_at`,
    )).rows
  );
  console.table(rows);
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
console.log(`token: ${token}`);
console.log(`QR text: aformulationoftruth.com/w/${token}`);
