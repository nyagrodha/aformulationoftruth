/**
 * Same-origin enforcement for state-changing requests.
 *
 * The app has never had any. There is no token, no Origin check and no Referer
 * check anywhere in it, and the only thing standing between a hostile page and
 * an authenticated POST is `SameSite=Lax` on the session cookies.
 *
 * Lax is not sufficient, and the gap is specific rather than theoretical: Lax
 * withholds cookies from cross-site subresource requests, but SENDS them on a
 * top-level navigation. A form on another origin that targets this one, posting
 * urlencoded fields, is a top-level navigation. The cookie rides along and the
 * request is indistinguishable from a real one.
 *
 * That mattered little while the authenticated write surface was one profile
 * upsert. It matters now: messaging accepts a body, attributes it to whoever
 * holds the cookie, and shows it to somebody else.
 *
 * WHY ORIGIN AND NOT A TOKEN
 *
 * A synchroniser token means server-side state or a signed value threaded
 * through every form, and this app renders forms in a dozen places that would
 * each have to be found and changed. `Origin` is sent by every browser on every
 * POST -- it predates fetch and is not suppressible by the calling page, which
 * is the property that makes it load-bearing. A page cannot lie about where it
 * came from; it can only decline to say, and declining is refused below.
 *
 * Zero-logging: nothing here logs an origin, a header, or a URL. A rejection is
 * a counter and a category, exactly as lib/session-auth.ts does it.
 */

import { increment } from './metrics.ts';

/** Methods that may change state, and therefore must prove their origin. */
const GUARDED = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type CsrfFailure =
  /** No Origin and no usable Referer. Refused rather than assumed friendly. */
  | 'missing'
  /** Origin present and pointing somewhere else. */
  | 'mismatch'
  /** BASE_URL is unset, so there is nothing to compare against. */
  | 'unconfigured';

/**
 * The origin this deployment answers to.
 *
 * Read per call rather than at module load, matching lib/jwt.ts and
 * lib/contact.ts: main.ts loads .env after the route manifest is imported, so a
 * module-level read sees an empty value and caches it forever.
 */
function expectedOrigin(): string | null {
  const base = Deno.env.get('BASE_URL');
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
}

/**
 * Whether a request may be allowed to change state.
 *
 * Safe methods pass untouched -- a GET that mutates is a bug this cannot fix.
 *
 * @returns null when the request is acceptable, or why it is not
 */
export function checkSameOrigin(req: Request): CsrfFailure | null {
  if (!GUARDED.has(req.method)) return null;

  const expected = expectedOrigin();
  if (!expected) {
    // Fail closed. An unconfigured BASE_URL must not silently disable the
    // check -- that is how a guard becomes decorative, and lib/age-encrypt.ts
    // records what a missing-variable fallback already cost this codebase once.
    increment('csrf.unconfigured');
    return 'unconfigured';
  }

  const origin = req.headers.get('Origin');
  if (origin) {
    if (origin === expected) return null;
    increment('csrf.mismatch');
    return 'mismatch';
  }

  // No Origin. Some older clients omit it on same-origin form posts, so fall
  // back to Referer, which carries the origin as its prefix. Referrer-Policy is
  // `no-referrer` on this site, so this rarely fires -- it exists so that a
  // browser which sends one is not refused for being generous.
  const referer = req.headers.get('Referer');
  if (referer) {
    try {
      if (new URL(referer).origin === expected) return null;
    } catch {
      // Unparseable Referer is no evidence at all; fall through to refusal.
    }
    increment('csrf.mismatch');
    return 'mismatch';
  }

  increment('csrf.missing');
  return 'missing';
}

/** True when the request proved it came from this site. */
export function isSameOrigin(req: Request): boolean {
  return checkSameOrigin(req) === null;
}

/**
 * A refusal response, deliberately uninformative.
 *
 * The message does not distinguish missing from mismatched: a caller probing
 * the boundary learns nothing from it that it did not already know.
 */
export function csrfRefusal(): Response {
  return new Response(
    JSON.stringify({ error: 'Request origin could not be verified.' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } },
  );
}
