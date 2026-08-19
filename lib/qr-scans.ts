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
 * Salts for days strictly before this are deleted. With SALT_RETENTION_DAYS=1
 * that is yesterday, so today and yesterday survive and no salt outlives 48h.
 *
 * Derived in TypeScript from UTC rather than in SQL from CURRENT_DATE, which
 * follows the database session's timezone and would shift the window by a day
 * on a non-UTC session -- the same trap the report query hit.
 */
export function saltCutoffDay(now: Date): string {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - SALT_RETENTION_DAYS);
  return utcDay(cutoff);
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

/** One definition of the prune, shared by the request path and the timer. */
const SALT_PRUNE_SQL = `DELETE FROM fresh_qr_salts WHERE day < $1`;

/**
 * Delete every salt older than the retention window, on its own connection.
 *
 * This is the scheduled entry point (scripts/prune-qr-salts.ts). It exists
 * because pruning inside the request path only runs while the object is being
 * scanned -- and a quiet noticeboard is the normal case, not the edge case.
 * Observed live: an Aug 11 salt was still present on Aug 13 because nothing
 * had visited the route since, leaving those visitors re-linkable past the
 * window the design promises.
 *
 * Returns the number of salts removed so the caller can report it.
 */
export async function pruneSalts(now: Date = new Date()): Promise<number> {
  const cutoff = saltCutoffDay(now);
  return await withConnection(async (client) => {
    const result = await client.queryObject(SALT_PRUNE_SQL, [cutoff]);
    return result.rowCount ?? 0;
  });
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

  // Opportunistic prune. scripts/prune-qr-salts.ts on a timer is what actually
  // guarantees the window -- this one only helps while traffic exists, and
  // that is exactly the condition under which it is not needed.
  //
  // Kept anyway, deliberately: the two mechanisms fail independently. A dead
  // timer is covered by traffic, an idle URL is covered by the timer, and the
  // cost here is one indexed DELETE against a table that holds at most two
  // rows. For a property the design rests on, that is worth paying twice.
  await client.queryObject(SALT_PRUNE_SQL, [saltCutoffDay(new Date())]);

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
