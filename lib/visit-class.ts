/**
 * The visit-counting rule: what a request has to look like to be a person.
 *
 * A pure module -- no Fresh, no database, no clock beyond what a caller hands
 * in -- so it can be pinned by tests without a server. See
 * docs/superpowers/notes/2026-09-23-audience-metric-audit.md §3.1 for the
 * design and why each check exists; this is that rule, not a summary of it.
 *
 * The rule runs in two halves because a decision it depends on (the response)
 * does not exist until after `ctx.next()`. `classifyVisit` takes both request
 * and response facts and is meant to be called once, after the response, from
 * routes/_middleware.ts. Nothing here mutates or logs anything -- it only
 * reads headers to decide which of four buckets a request belongs in.
 */

import { isBotUserAgent } from './qr-scans.ts';

export type VisitClass = 'person' | 'bot' | 'unclassified' | 'none';

/**
 * Paths excluded from the count even though they are not under `/api/`.
 *
 * Empty today -- both of the site's own monitoring endpoints
 * (`/api/health`, `/api/metrics`) already fail the `/api/` check below. Kept
 * as its own set, rather than folded into that check, for the next
 * non-`/api` exception someone needs -- so that addition does not require
 * relaxing the `/api/` rule itself.
 */
export const NOT_COUNTED = new Set<string>([]);

/**
 * Classify one request into the bucket it should be counted in.
 *
 * Order matters only where two checks could both fire on the same request;
 * where it does, the more specific answer wins. A bot marker beats "no
 * Sec-Fetch headers" (`unclassified`) because the brooch and its ilk have no
 * Sec-Fetch headers at all, and the whole point of this rule is to name them
 * rather than let them dilute the "no Sec-Fetch = older browser" bucket.
 *
 * @param method request method, e.g. `req.method`
 * @param pathname `new URL(req.url).pathname`
 * @param headers the REQUEST headers (Sec-Fetch-*, Sec-Purpose, User-Agent)
 * @param status the RESPONSE status code
 * @param contentType the RESPONSE `Content-Type` header, or null
 */
export function classifyVisit(
  method: string,
  pathname: string,
  headers: Headers,
  status: number,
  contentType: string | null,
): VisitClass {
  // Browsers never navigate with anything but GET; a POST navigation (a form
  // submit) is followed by a counted GET after its redirect.
  if (method !== 'GET') return 'none';

  // Covers /api/brooch/status, /api/metrics/increment, /api/health, /api and
  // everything else under the API surface, whatever it grows to be next.
  if (pathname === '/api' || pathname.startsWith('/api/')) return 'none';

  // Belt-and-braces: routes/_middleware.ts only reaches this function when
  // ctx.destination === 'route', which already excludes Fresh's own island
  // chunks -- this guards the invariant even if that gate is ever loosened.
  if (pathname.startsWith('/_frsh/')) return 'none';

  if (NOT_COUNTED.has(pathname)) return 'none';

  // Only now does the response matter -- 3xx, 404, 405 and 5xx are excluded,
  // so a redirect chain (e.g. /WillyStCoop -> /WillyStCo-op -> /w/x) counts
  // at most once, at its destination.
  if (status < 200 || status >= 300) return 'none';
  if (!contentType || !contentType.toLowerCase().startsWith('text/html')) return 'none';

  // Chrome's prerender and its private prefetch proxy both set this; a
  // speculative load is not a visit until the person actually lands on it,
  // and if they do, that lands as its own counted request.
  const purpose = `${headers.get('sec-purpose') ?? ''} ${headers.get('purpose') ?? ''}`.toLowerCase();
  if (purpose.includes('prefetch')) return 'none';

  // Checked before Sec-Fetch-*, deliberately: the brooch and most of the
  // fetch-library/scanner traffic this list exists for send no Sec-Fetch
  // headers, and a bot marker match is a more useful answer than dumping
  // that traffic into `unclassified` alongside genuinely old browsers.
  const userAgent = headers.get('user-agent') ?? '';
  if (isBotUserAgent(userAgent)) return 'bot';

  const mode = headers.get('sec-fetch-mode');
  const dest = headers.get('sec-fetch-dest');

  // Pre-Chrome-76/Firefox-90/Safari-16.4 browsers and some in-app webviews
  // send neither header. Flagged, not dropped or promoted to `person`, so
  // the report can show how large this correction is.
  if (mode === null && dest === null) return 'unclassified';

  // The one shape a real top-level navigation takes.
  if (mode === 'navigate' && dest === 'document') return 'person';

  // Anything else with Sec-Fetch present but not this shape: fetch/XHR
  // (`empty`), an iframe, a worker, a `<link rel=prefetch>`, etc.
  return 'none';
}

/**
 * Whether this request opted out via Global Privacy Control or Do Not Track.
 *
 * Kept separate from classifyVisit: an opted-out request is never handed a
 * pseudonym at all (see lib/audience.ts's recordOptOutNavigation), which is a
 * stricter promise than "counted in a set nobody outside this process can
 * read". Callers must check this before computing anything from the address
 * or user agent, not after.
 */
export function optedOut(headers: Headers): boolean {
  return headers.get('sec-gpc') === '1' || headers.get('dnt') === '1';
}
