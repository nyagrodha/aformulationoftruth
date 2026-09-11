/**
 * Audience counting: how many, never who.
 *
 * Answers "roughly how many people visited" without keeping anything a person
 * could be recovered from. The durable footprint is integers in
 * fresh_audience_windows and nothing else — no digest, no address, no user
 * agent is ever written.
 *
 * ## Why the salt lives here and not in Postgres
 *
 * lib/qr-scans.ts keeps its salt in a table beside the digests it keys. That is
 * acceptable there for a bounded prize, but it means anyone with read access to
 * the database during the salt's life can invert every digest by enumeration:
 * (IPv4, User-Agent) is a small space against a key you already hold. A DELETEd
 * BYTEA also survives in the heap page until VACUUM, in the WAL until
 * checkpoint, and in every backup taken during the window.
 *
 * This salt is 32 random bytes that exist only in this process's heap, and are
 * imported as a NON-EXTRACTABLE CryptoKey and then zeroed — so for the rest of
 * the window there is no readable copy of the secret anywhere. This host has no
 * swap, so it has no disk representation at all.
 *
 * What that buys, stated precisely: nothing survives the window. It does not
 * mean nothing exists during it. While a window is open, `seen` holds live
 * pseudonyms, and anyone who can read this process's memory has both those and
 * the key. The claim is bounded exposure, not zero exposure.
 *
 * ## Why fixed four-hour windows
 *
 * 4h divides 24 exactly, so a window never straddles midnight and a day's total
 * is well defined and comparable with other days. Randomised interval lengths
 * were considered and dropped: with nothing persisted there are no stored
 * pseudonyms for an observer to align against a boundary, so unpredictable
 * boundaries buy nothing here, while variable-length windows make the
 * over-count factor vary day to day and destroy the trend.
 *
 * ## What the number means
 *
 * An UPPER BOUND on people, not an estimate. A visitor at 09:00 and again at
 * 20:00 spans two windows and is counted twice; a process restart opens a new
 * window and counts them again. The scheme can split one person into several
 * but can never merge two people into one, so it only ever over-counts. Report
 * it as a bound or it is a wrong number wearing a right number's clothes.
 *
 * ## Single-process assumption
 *
 * State is per-process, like lib/metrics.ts. Under multiple processes each
 * keeps its own window and its own row, and the day total over-counts further —
 * still in the safe direction, but worth knowing before scaling out.
 */

import { hmacKey, hmacSignWith, randomBytes, randomToken } from './crypto.ts';
import { isBotUserAgent } from './qr-scans.ts';
import { withConnection } from './db.ts';
import { increment } from './metrics.ts';

/** Four hours, in ms. Divides 24h exactly; see the header. */
export const WINDOW_MS = 4 * 60 * 60 * 1000;

/** How often open counts are written through, so a crash loses little. */
export const FLUSH_INTERVAL_MS = 60_000;

/**
 * Ceiling on tracked pseudonyms per window.
 *
 * Without it the set is an unbounded allocation driven by whoever sends the
 * most distinct addresses — a memory-exhaustion vector, not merely a big
 * number. Past the cap the count stops rising and `truncated` records that the
 * figure is a floor rather than a bound, which is the honest failure.
 */
export const MAX_TRACKED = 200_000;

/**
 * Domain tag, first field of every HMAC message.
 *
 * Domain separation is enforced twice over. The salt here is independent of the
 * QR salt by construction — different storage medium entirely, no code path
 * connects them. This tag covers the case where that separation is later broken
 * by someone "cleaning up" the duplication: even given the same salt bytes, an
 * audience digest and a QR digest of the same visitor differ.
 *
 * It is a compile-time constant, never user input, so it cannot contain the
 * newline separator and cannot be used to forge a collision.
 */
const AUDIENCE_DOMAIN = 'audience-count';

export type Site = 'a4t' | 'gimbal' | 'other';

const SITE_BY_HOST: ReadonlyMap<string, Site> = new Map([
  ['aformulationoftruth.com', 'a4t'],
  ['www.aformulationoftruth.com', 'a4t'],
  ['app.aformulationoftruth.com', 'a4t'],
  ['gimbal.fobdongle.com', 'gimbal'],
]);

/**
 * Per-process token. A restarted process cannot resume a count whose pseudonyms
 * it no longer holds, so it opens a new row instead of overwriting one — the
 * day total then over-counts rather than silently under-counting.
 */
const RUN_ID = randomToken(8);

interface Counters {
  seen: Set<string>;
  botSeen: Set<string>;
  requests: number;
}

interface OpenWindow {
  start: number;
  key: CryptoKey;
  bySite: Map<Site, Counters>;
  truncated: boolean;
}

let open: OpenWindow | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;

/** Floor a time to its 4h UTC boundary. */
export function windowStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
}

/**
 * Map a Host header to a bounded label.
 *
 * Host is client-supplied, so this is an allowlist rather than a passthrough:
 * without it the `site` column's cardinality is whatever an attacker chooses.
 */
export function siteFor(host: string | null): Site {
  if (!host) return 'other';
  const bare = host.split(':')[0].trim().toLowerCase();
  return SITE_BY_HOST.get(bare) ?? 'other';
}

/**
 * The visitor pseudonym.
 *
 * Newline-separated, domain-tagged. The separator is load-bearing exactly as it
 * is in lib/qr-scans.ts: without it an address ending in the separator could
 * collide with a user agent beginning with one, letting a crafted user agent
 * land in another visitor's bucket.
 */
export function audienceHash(key: CryptoKey, ip: string, userAgent: string): Promise<string> {
  return hmacSignWith(`${AUDIENCE_DOMAIN}\n${ip}\n${userAgent}`, key);
}

function emptyCounters(): Counters {
  return { seen: new Set(), botSeen: new Set(), requests: 0 };
}

/**
 * Mint a window: fresh salt, imported non-extractable, raw bytes zeroed.
 *
 * The zeroing is what makes "the salt does not outlive the window" a statement
 * about this process rather than a hope. It overwrites the one buffer we hold;
 * importKey may have copied the bytes internally, so the honest claim is that
 * we retain no readable copy, not that none exists anywhere.
 */
async function mint(start: number): Promise<OpenWindow> {
  const raw = randomBytes(32);
  const key = await hmacKey(raw);
  raw.fill(0);
  return { start, key, bySite: new Map(), truncated: false };
}

/**
 * Record one request. Never throws.
 *
 * Returns nothing on purpose: a caller able to see whether this visitor was new
 * could observe the count from outside, which is why lib/qr-scans.ts's
 * recordScan returns void too.
 *
 * Does no database work, so it cannot stall the request path — the write
 * happens on the flush timer and at rotation. That is a real benefit of holding
 * state in memory, and it is why no withDeadline wrapper is needed here.
 */
export async function recordVisit(
  host: string | null,
  ip: string,
  userAgent: string,
  now: Date = new Date(),
): Promise<void> {
  const start = windowStart(now).getTime();

  if (!open || open.start !== start) {
    const closing = open;
    open = await mint(start);
    if (closing) {
      // Persist without awaiting: the request path must not wait on Postgres.
      // Explicit catch rather than leaning on main.ts's unhandled-rejection
      // guard, which exists as a backstop, not as error handling.
      persist(closing).catch(() => increment('errors.db.audience_flush'));
    }
  }

  const site = siteFor(host);
  let counters = open.bySite.get(site);
  if (!counters) {
    counters = emptyCounters();
    open.bySite.set(site, counters);
  }
  counters.requests += 1;

  const digest = await audienceHash(open.key, ip, userAgent);
  const bucket = isBotUserAgent(userAgent) ? counters.botSeen : counters.seen;

  if (bucket.size >= MAX_TRACKED && !bucket.has(digest)) {
    if (!open.truncated) {
      open.truncated = true;
      increment('visits.set_capped');
    }
    return;
  }
  bucket.add(digest);
}

/** Write one window's counts through. Idempotent per (window, site, run). */
async function persist(w: OpenWindow): Promise<void> {
  if (w.bySite.size === 0) return;
  const startedAt = new Date(w.start).toISOString();

  await withConnection(async (client) => {
    for (const [site, c] of w.bySite) {
      await client.queryObject(
        `INSERT INTO fresh_audience_windows
           (window_start, site, run_id, visitors, bot_visitors, requests, truncated, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (window_start, site, run_id) DO UPDATE
           SET visitors     = EXCLUDED.visitors,
               bot_visitors = EXCLUDED.bot_visitors,
               requests     = EXCLUDED.requests,
               truncated    = EXCLUDED.truncated,
               updated_at   = NOW()`,
        [startedAt, site, RUN_ID, c.seen.size, c.botSeen.size, c.requests, w.truncated],
      );
    }
  });
}

/**
 * Flush the open window, rotating first if its boundary has passed.
 *
 * Both a rotation check and a flush, because they fail under opposite
 * conditions — the same reason lib/qr-scans.ts keeps a request-path prune AND a
 * timer. The request path covers a dead timer; the timer covers an idle site,
 * where without it a window would hold its salt indefinitely after traffic
 * stopped. That idle case is the normal one here, not the edge case.
 */
export async function flushAudience(now: Date = new Date()): Promise<void> {
  if (!open) return;
  const start = windowStart(now).getTime();
  if (open.start !== start) {
    const closing = open;
    open = null;
    await persist(closing);
    return;
  }
  await persist(open);
}

/** Start the periodic flush. Idempotent. */
export function startAudienceFlush(): void {
  if (flushTimer !== null) return;
  const timer = setInterval(() => {
    flushAudience().catch(() => increment('errors.db.audience_flush'));
  }, FLUSH_INTERVAL_MS);
  flushTimer = timer;
  // Must not hold the process open, and must not trip Deno's test leak detector.
  Deno.unrefTimer(timer);
}

/** Final flush and drop the key. For SIGTERM/SIGINT. */
export async function shutdownAudience(): Promise<void> {
  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  const closing = open;
  open = null;
  if (closing) await persist(closing);
}

/** Test hook: drop all state without touching the database. */
export function _resetForTest(): void {
  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  open = null;
}

/** Test hook: the open window's key, or null. Never exported to callers. */
export function _openKeyForTest(): CryptoKey | null {
  return open?.key ?? null;
}
