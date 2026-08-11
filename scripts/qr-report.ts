#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/**
 * How many discrete visits a QR code produced. Operator tool — run it yourself.
 *
 *   deno run -A scripts/qr-report.ts                     # the co-op drop
 *   deno run -A scripts/qr-report.ts --slug OtherThing
 *   deno run -A scripts/qr-report.ts --days 30
 *   deno run -A scripts/qr-report.ts --bots              # include unfurlers
 *
 * A CLI rather than an endpoint on purpose: this is the foot traffic of a
 * physical place, and a route would be one auth bug away from publishing it.
 * There is nothing here to guard because there is no surface to reach.
 *
 * "Discrete" means one person-shaped visitor per UTC day, identified by
 * HMAC(daily salt, address + user agent). Two consequences worth holding:
 * the same person on two days counts twice, and the daily salts are deleted
 * after 48h, so these totals can never be recomputed or re-linked from the
 * raw rows — not by anyone, including whoever runs this.
 *
 * Spec: docs/superpowers/specs/2026-08-11-coop-qr-scan-counting-design.md
 */

import { withConnection } from '../lib/db.ts';

// Match migrate.ts and seed-wearable.ts: load env files so DATABASE_URL is set.
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

function arg(name: string, fallback: string): string {
  const i = Deno.args.indexOf(`--${name}`);
  return i >= 0 && Deno.args[i + 1] ? Deno.args[i + 1] : fallback;
}

const SLUG = arg('slug', 'WillyStCo-op');
const DAYS = Number(arg('days', '90'));
const INCLUDE_BOTS = Deno.args.includes('--bots');

// Must be an int4: DAYS is cast to ::int in the query below, so a fractional
// or oversized value reaches the operator as a raw Postgres cast error rather
// than as the message here.
if (!Number.isSafeInteger(DAYS) || DAYS <= 0 || DAYS > 2_147_483_647) {
  console.error('--days must be a positive integer no greater than 2147483647');
  Deno.exit(2);
}

interface DayRow {
  day: Date;
  visitors: bigint;
  scans: bigint;
  bots: bigint;
}

const rows = await withConnection(async (client) => {
  const result = await client.queryObject<DayRow>(
    `SELECT day,
            COUNT(*) FILTER (WHERE $3 OR NOT bot)::bigint          AS visitors,
            COALESCE(SUM(hits) FILTER (WHERE $3 OR NOT bot), 0)::bigint AS scans,
            COUNT(*) FILTER (WHERE bot)::bigint                    AS bots
       FROM fresh_qr_scans
      WHERE slug = $1
        -- UTC, not CURRENT_DATE: the day column is bucketed in UTC, and
        -- CURRENT_DATE follows the session timezone, so a non-UTC session
        -- would silently shift the window by a day. DAYS - 1 so --days 90
        -- covers ninety dates including today, not ninety-one.
        AND day >= ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - ($2::int - 1))
      GROUP BY day
      ORDER BY day`,
    [SLUG, DAYS, INCLUDE_BOTS],
  );
  return result.rows;
});

if (rows.length === 0) {
  console.log(`No scans recorded for "${SLUG}" in the last ${DAYS} days.`);
  console.log('');
  console.log('If you expected some, check TRUST_PROXY on the deployment before');
  console.log('concluding nobody scanned: behind a reverse proxy with it unset,');
  console.log('every visitor hashes to the proxy and the count collapses toward 1.');
  Deno.exit(0);
}

const totalVisitors = rows.reduce((n, r) => n + Number(r.visitors), 0);
const totalScans = rows.reduce((n, r) => n + Number(r.scans), 0);
const totalBots = rows.reduce((n, r) => n + Number(r.bots), 0);
const iso = (d: Date) => d.toISOString().slice(0, 10);

console.log('');
console.log(`  ${SLUG}   ${iso(rows[0].day)} to ${iso(rows[rows.length - 1].day)}`);
console.log('');
console.log(`  discrete visitors   ${totalVisitors}`);
console.log(`  raw scans           ${totalScans}`);
console.log(
  `  link previews       ${totalBots}${INCLUDE_BOTS ? ' (counted above)' : ' (excluded)'}`,
);
console.log('');
console.log('  day           visitors   scans');
console.log('  ----------    --------   -----');
for (const r of rows) {
  console.log(
    `  ${iso(r.day)}    ${String(r.visitors).padStart(8)}   ${String(r.scans).padStart(5)}`,
  );
}
console.log('');
console.log('  A visitor is counted once per UTC day. The same person returning');
console.log('  the next day counts again; the daily salt is gone after 48h, so');
console.log('  those two visits can no longer be linked, by anyone.');
console.log('');

// The pool holds the process open otherwise.
const { closePool } = await import('../lib/db.ts');
await closePool();
