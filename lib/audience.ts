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
 * mean nothing exists during it. While a window is open, the `person`/`bot`/
 * `unclassified` sets hold live pseudonyms, and anyone who can read this
 * process's memory has both those and the key. The claim is bounded exposure,
 * not zero exposure.
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

/**
 * Which set a classified request's pseudonym lands in.
 *
 * Deliberately not `optout` -- an opted-out request never gets a pseudonym at
 * all (see recordOptOutNavigation), so it cannot be a value of this type.
 */
export type VisitBucket = 'person' | 'bot' | 'unclassified';

interface Counters {
  person: Set<string>;
  bot: Set<string>;
  unclassified: Set<string>;
  /**
   * Plain count, not a set. Sec-GPC/DNT requests that would otherwise have
   * been `person` are tallied here instead -- no pseudonym is ever computed
   * for them, so there is nothing to put in a set.
   */
  optoutNavigations: number;
  requests: number;
}

export interface OpenWindow {
  start: number;
  key: CryptoKey;
  bySite: Map<Site, Counters>;
  truncated: boolean;
}

let open: OpenWindow | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;

/**
 * In-flight mint()s, keyed by window start. Single-flight per start value --
 * see ensureWindow's comment for why this is the fix for F14 (the
 * window-rotation race).
 */
const minting = new Map<number, Promise<OpenWindow>>();

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
  return {
    person: new Set(),
    bot: new Set(),
    unclassified: new Set(),
    optoutNavigations: 0,
    requests: 0,
  };
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
 * Ensure a window is open for `now` and return it. Never returns two
 * different objects for the same boundary to concurrent callers -- that
 * guarantee is the fix for F14 (the window-rotation race audit finding).
 *
 * The bug it replaces: the old version re-checked the *global* `open`
 * variable after its own `await mint(start)`, so two concurrent callers who
 * both saw the old window stale would each mint their OWN new window, and
 * whichever finished last silently overwrote the other in the module-level
 * `open` slot -- discarding every count already added to the one it replaced
 * (audit: "the last writer replaces open, discarding counts added to the
 * earlier new window").
 *
 * The fix is single-flight per `start`, tracked in `minting`: the first
 * caller for a given boundary reserves that slot SYNCHRONOUSLY (before any
 * await), so a second concurrent caller for the exact same boundary always
 * finds the reservation and joins the same promise instead of minting its
 * own window. All such callers then get literally the same OpenWindow object
 * back and mutate its Counters directly -- not via the global `open`
 * pointer -- so it does not matter whether `open` has since moved on to a
 * later boundary by the time this call's own work (hashing, incrementing)
 * happens: the caller always writes into the window that actually matches
 * its own `now`, which is the correct window for it regardless of what is
 * globally "current".
 */
function ensureWindow(now: Date): Promise<OpenWindow> {
  const start = windowStart(now).getTime();

  // Fast path: no map lookup needed for the overwhelmingly common case of
  // "still inside the current window". Not `async` -- both branches already
  // return a Promise<OpenWindow>, and there is no `await` of its own to do.
  if (open && open.start === start) return Promise.resolve(open);

  let promise = minting.get(start);
  if (!promise) {
    promise = installWindow(start);
    minting.set(start, promise);
  }
  return promise;
}

/**
 * Mint the window for `start`, then decide what becomes of it. Runs at most
 * once per `start` (see ensureWindow).
 *
 * Windows are installed as `open` in strictly increasing `start` order,
 * regardless of the order their mint()s happen to resolve in -- two
 * different boundaries can be minting concurrently (a request arriving right
 * at the edge, plus one a few milliseconds into the new window), and nothing
 * guarantees which finishes its async key import first. A window that turns
 * out to already be older than the currently-installed `open` by the time
 * it resolves is never installed -- it is persisted directly instead, since
 * it is otherwise unreachable and would silently lose whatever this
 * function's own caller (and anyone who joined its promise) had already
 * added to it.
 */
async function installWindow(start: number): Promise<OpenWindow> {
  const win = await mint(start);
  minting.delete(start);

  if (!open || win.start > open.start) {
    const previous = open;
    open = win;
    if (previous) {
      // Persist without awaiting: the request path must not wait on
      // Postgres. Explicit catch rather than leaning on main.ts's
      // unhandled-rejection guard, which exists as a backstop, not as error
      // handling.
      _persistHooks.persist(previous).catch(() => increment('errors.db.audience_flush'));
    }
  } else {
    // This boundary resolved after a newer one was already installed. It
    // was never `open`, so nothing else will ever persist it -- do it here.
    _persistHooks.persist(win).catch(() => increment('errors.db.audience_flush'));
  }

  return win;
}

/** This site's counters within `win`, creating them on first touch. */
function countersFor(win: OpenWindow, site: Site): Counters {
  let counters = win.bySite.get(site);
  if (!counters) {
    counters = emptyCounters();
    win.bySite.set(site, counters);
  }
  return counters;
}

/**
 * The window to mutate right now: always the CURRENT `open`, never a
 * reference resolved before an earlier `await` that might since have been
 * superseded.
 *
 * This is the second half of the F14 fix (see ensureWindow's docstring for
 * the first half). Single-flight mint()s stop two callers from minting two
 * different windows for the same boundary, but a caller can still hold a
 * `win` obtained several `await`s ago -- long enough for a DIFFERENT
 * boundary's rotation to complete in the meantime, install a new `open`, and
 * fire-and-forget persist the one this caller is holding. Writing into that
 * window after its persist() has already read its counts would silently
 * lose the write, because nothing ever persists it again.
 *
 * Re-reading `open` as the LAST synchronous step before mutating (no further
 * `await` in between) closes that gap: a rotation and a write can never
 * interleave mid-mutation (JS runs each to completion once started), so
 * whichever one actually runs first is authoritative, and a write that loses
 * the race for its original window is simply redirected to whatever
 * replaced it -- never dropped. The rare cost is a pseudonym occasionally
 * computed with an already-superseded window's salt landing in the next
 * window's set instead of its own; that can only split one visitor into two
 * entries, never merge two into one, so it does not weaken the "never
 * merges" guarantee (see the module header). `fallback` covers only the
 * defensive case where `open` is somehow null despite `win` existing, which
 * ensureWindow's contract should make unreachable.
 */
function currentWindow(fallback: OpenWindow): OpenWindow {
  return open ?? fallback;
}

/**
 * Record that a request reached the middleware, independent of how (or
 * whether) it classifies. A plain integer, no pseudonym, no hashing --
 * called for every method and every eventual status, including all of
 * `/api/*` and opted-out requests.
 *
 * Fixes Ruling S17: `recordVisit`/`recordOptOutNavigation` used to be the
 * only things that touched `requests`, so a window containing nothing but
 * 404 probes, `/api/*` calls or POSTs -- none of which ever reach either of
 * those -- got NO row at all once persisted (`persist` skips a site with no
 * counters, and skips a window with no sites). `monitoring/daily_report.py`
 * treats "no row for this window" as "the counter wasn't running", so that
 * silence read as a false outage rather than as ordinary bot/API traffic.
 * Calling this unconditionally for every route request, before
 * classification, means the window always has somewhere to put at least a
 * `requests` count, so a row exists whenever the app was actually up.
 */
export async function noteRequest(host: string | null, now: Date = new Date()): Promise<void> {
  const win = await ensureWindow(now);
  const counters = countersFor(currentWindow(win), siteFor(host));
  counters.requests += 1;
}

/**
 * Record one classified request's pseudonym. Never throws.
 *
 * `bucket` is the caller's classification (lib/visit-class.ts's
 * `classifyVisit`), computed from the response as well as the request, so
 * this function trusts it rather than re-deriving it from the user agent
 * alone the way the pre-2026-09-23 version did.
 *
 * Does NOT touch `requests` -- see noteRequest, which every request reaching
 * the middleware calls independently of this one. Counting it here too would
 * double it for every classified request.
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
  bucket: VisitBucket,
  now: Date = new Date(),
): Promise<void> {
  const win = await ensureWindow(now);
  const digest = await audienceHash(win.key, ip, userAgent);
  // Re-resolved AFTER the hashing await -- see currentWindow's docstring.
  const target = currentWindow(win);
  const counters = countersFor(target, siteFor(host));
  const set = counters[bucket];

  if (set.size >= MAX_TRACKED && !set.has(digest)) {
    if (!target.truncated) {
      target.truncated = true;
      increment('visits.set_capped');
    }
    return;
  }
  set.add(digest);
}

/**
 * Record an opted-out navigation. Never throws, never computes a pseudonym.
 *
 * Sec-GPC/DNT is a stricter promise than "counted anonymously": no address or
 * user agent is ever hashed for these requests, not even into the in-heap,
 * never-persisted key every other bucket uses. `optout_navigations` is
 * therefore a plain integer, incremented only when the request would
 * otherwise have classified as `person` -- a bot or unclassified opt-out
 * request is simply not counted anywhere, per the owner's ruling.
 *
 * Also does NOT touch `requests` -- noteRequest already counted this request
 * (opted out or not), so incrementing it again here would double it.
 */
export async function recordOptOutNavigation(host: string | null, now: Date = new Date()): Promise<void> {
  const win = await ensureWindow(now);
  const counters = countersFor(currentWindow(win), siteFor(host));
  counters.optoutNavigations += 1;
}

/** Write one window's counts through. Idempotent per (window, site, run). */
async function persist(w: OpenWindow): Promise<void> {
  if (w.bySite.size === 0) return;
  const startedAt = new Date(w.start).toISOString();

  await withConnection(async (client) => {
    for (const [site, c] of w.bySite) {
      await client.queryObject(
        `INSERT INTO fresh_audience_windows
           (window_start, site, run_id, visitors, bot_visitors, unclassified_visitors,
            optout_navigations, requests, truncated, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (window_start, site, run_id) DO UPDATE
           SET visitors              = EXCLUDED.visitors,
               bot_visitors          = EXCLUDED.bot_visitors,
               unclassified_visitors = EXCLUDED.unclassified_visitors,
               optout_navigations    = EXCLUDED.optout_navigations,
               requests              = EXCLUDED.requests,
               truncated             = EXCLUDED.truncated,
               updated_at            = NOW()`,
        [
          startedAt,
          site,
          RUN_ID,
          c.person.size,
          c.bot.size,
          c.unclassified.size,
          c.optoutNavigations,
          c.requests,
          w.truncated,
        ],
      );
    }
  });
}

/**
 * Test seam: lets lib/audience_test.ts observe (or fully replace) what would
 * be persisted, without a real database. Every internal call site goes
 * through this indirection rather than calling `persist` directly, the same
 * pattern routes/_middleware.ts uses for `audience.recordVisit` -- so the
 * rotation-race test can prove a specific window's tally without needing
 * DATABASE_URL configured.
 */
export const _persistHooks: { persist: (w: OpenWindow) => Promise<void> } = { persist };

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
    await _persistHooks.persist(closing);
    return;
  }
  await _persistHooks.persist(open);
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
  if (closing) await _persistHooks.persist(closing);
}

/**
 * Test hook: drop all state without touching the database. Also clears the
 * single-flight `minting` map and restores the real `persist` -- a test that
 * forgot to restore its own mock (or crashed before its `finally` ran) must
 * not leak into whichever test runs next in the same process.
 */
export function _resetForTest(): void {
  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  open = null;
  minting.clear();
  _persistHooks.persist = persist;
}

/** Test hook: the open window's key, or null. Never exported to callers. */
export function _openKeyForTest(): CryptoKey | null {
  return open?.key ?? null;
}

/**
 * Test hook: the open window's counts for one site, as plain numbers, or null
 * if that site has no counters yet this window. Reads the in-memory state
 * only -- never touches the database -- so tests stay hermetic as long as
 * they do not cross a window boundary (which would trigger persist()).
 */
export function _countersForTest(site: Site): {
  person: number;
  bot: number;
  unclassified: number;
  optoutNavigations: number;
  requests: number;
} | null {
  const c = open?.bySite.get(site);
  if (!c) return null;
  return {
    person: c.person.size,
    bot: c.bot.size,
    unclassified: c.unclassified.size,
    optoutNavigations: c.optoutNavigations,
    requests: c.requests,
  };
}
