/**
 * QR scan counting.
 *
 * A QR-bearing object in public points at a slug route; this records that a
 * visit happened and how many distinct visitors it came from, without ever
 * storing an address or a user agent.
 *
 * Identity is HMAC-SHA256(salt_for_today, ip + "\n" + user_agent). The salt is
 * random per UTC day and deleted after 48 hours, which is what makes
 * "non-linkable across days" true rather than decorative: once a salt is gone,
 * that day's rows cannot be recomputed by anyone, including us. Deriving the
 * salt from a long-lived secret was rejected for exactly that reason -- it
 * would leave every past day permanently re-linkable by whoever holds it.
 *
 * The address exists only as an argument to visitorHash. It is never stored,
 * never returned, and must never be logged -- scripts/check-zero-logging.sh
 * enforces the last of those.
 *
 * Spec: docs/superpowers/specs/2026-08-11-coop-qr-scan-counting-design.md
 */

import type { PoolClient } from 'postgres';
import { hmacSign, randomBytes } from './crypto.ts';
import { withConnection } from './db.ts';

/**
 * Days of salt history kept *beyond today*. 1 retains today and yesterday,
 * which bounds any salt's age at 48 hours; past that its rows are opaque
 * forever, to us included.
 *
 * This was 2, which kept the day before yesterday as well and so retained up
 * to 72 hours -- the guarantee the whole design rests on, quietly overshot by
 * a day.
 */
export const SALT_RETENTION_DAYS = 1;

/**
 * User-agent substrings belonging to link unfurlers and crawlers.
 *
 * These are phantom scans: a messaging app fetches the URL to build a preview
 * that nobody chose to open. Counting them as visitors would inflate the
 * headline number by a factor nobody can estimate after the fact.
 *
 * They are flagged rather than dropped, so the report can show the size of the
 * correction instead of hiding it. Extend this list as new senders appear --
 * which apps matter depends on the audience, so it is the operator's call.
 */
export const BOT_USER_AGENT_MARKERS = [
  'bot', // Slackbot, Twitterbot, TelegramBot, Discordbot, Googlebot
  'crawler',
  'spider',
  'facebookexternalhit',
  'whatsapp',
  'skypeuripreview',
  'embedly',
  'quora link preview',
  'vkshare',
  'preview', // Apple's iMessage/Safari link preview fetches
  'curl/',
  'wget/',
  'python-requests',
  'go-http-client',
  'headlesschrome',
];

/**
 * Reject if `work` has not settled within `ms`.
 *
 * Wrapping recordScan in try/catch handles a database that *fails*. It does
 * nothing for one that *stalls* -- an exhausted pool or a query with no
 * statement timeout never rejects, so the handler would wait on it and the
 * scanner would never receive their redirect. That is a worse failure than
 * the one the try/catch was written for, because it is silent from both ends.
 *
 * The abandoned work is not cancelled -- deno-postgres exposes no cancellation
 * -- so the query runs to completion against a connection nobody is waiting
 * on. That is acceptable here: the row is idempotent and the pool reclaims the
 * connection. Promise.race attaches a handler to both sides, so a late
 * rejection from the abandoned work is already handled and cannot surface as
 * an unhandled rejection.
 */
export function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  // Not `number`: nodeModulesDir puts Node's typings in scope, where
  // setTimeout returns a Timeout object rather than a handle.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('deadline')), ms);
  });
  // clearTimeout on both paths: an armed timer holds the process open and
  // trips Deno's leak detector in tests.
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/** The UTC calendar day a timestamp falls in, as YYYY-MM-DD. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Whether a user agent looks like an automated fetch rather than a person.
 *
 * An empty user agent is deliberately NOT treated as a bot. Privacy-hardened
 * browsers and some in-app webviews send none, and discarding those would
 * silently drop real scans -- the opposite of the error this guards against.
 */
export function isBotUserAgent(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  if (!ua) return false;
  return BOT_USER_AGENT_MARKERS.some((marker) => ua.includes(marker));
}

/**
 * Pseudonymous per-day identity for a visitor.
 *
 * The newline separator is load-bearing: concatenating the fields without one
 * would let an address ending in the separator collide with a user agent
 * beginning with one, so a crafted user agent could land in another visitor's
 * bucket. Newline cannot appear in either field as delivered by the runtime.
 */
export function visitorHash(
  salt: Uint8Array<ArrayBuffer>,
  ip: string,
  userAgent: string,
): Promise<string> {
  return hmacSign(`${ip}\n${userAgent}`, salt);
}

/**
 * Today's salt, minting one if this is the day's first visit, and pruning any
 * that have aged out.
 *
 * The INSERT ... ON CONFLICT DO NOTHING followed by a SELECT is what makes two
 * simultaneous first-visits agree on one salt. Reading first and inserting
 * after would race, and the two requests would hash the same person into two
 * different buckets.
 */
async function saltForDay(client: PoolClient, day: string): Promise<Uint8Array<ArrayBuffer>> {
  await client.queryObject(
    `INSERT INTO fresh_qr_salts (day, salt) VALUES ($1, $2)
       ON CONFLICT (day) DO NOTHING`,
    [day, randomBytes(32)],
  );

  // Pruned in the request path rather than on a schedule: there is no
  // scheduler in this app, and adding one for this is a bigger decision than
  // the feature warrants.
  //
  // KNOWN LIMIT, and it is a real one: if scanning stops, pruning stops with
  // it, and salts outlive the 48h window for as long as the route is idle.
  // The exposure is that someone with database access could recompute hashes
  // for days that should have become unrecomputable. If this object turns out
  // to see long quiet stretches, move this DELETE to a scheduled UTC task --
  // it is written to be safe to run from anywhere.
  await client.queryObject(
    `DELETE FROM fresh_qr_salts WHERE day < ($1::date - $2::int)`,
    [day, SALT_RETENTION_DAYS],
  );

  const result = await client.queryObject<{ salt: Uint8Array }>(
    `SELECT salt FROM fresh_qr_salts WHERE day = $1`,
    [day],
  );
  const salt = result.rows[0]?.salt;
  if (!salt) throw new Error('qr salt missing immediately after insert');
  return salt as Uint8Array<ArrayBuffer>;
}

/**
 * Record one visit to a slug.
 *
 * Returns nothing: callers must not branch on whether this is a new visitor,
 * because that would make the count observable from outside.
 */
export async function recordScan(
  slug: string,
  ip: string,
  userAgent: string,
  now: Date = new Date(),
): Promise<void> {
  const day = utcDay(now);
  const bot = isBotUserAgent(userAgent);

  await withConnection(async (client) => {
    const salt = await saltForDay(client, day);
    const hash = await visitorHash(salt, ip, userAgent);

    // One row per (slug, day, visitor); hits counts the re-scans within it.
    // Distinct visitors is then the row count and raw scans is SUM(hits), so
    // neither number can be lost to a bug in the other.
    await client.queryObject(
      `INSERT INTO fresh_qr_scans (slug, day, visitor_hash, bot)
            VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug, day, visitor_hash)
         DO UPDATE SET hits = fresh_qr_scans.hits + 1`,
      [slug, day, hash, bot],
    );
  });
}
