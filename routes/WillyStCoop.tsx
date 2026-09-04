/**
 * Willy St Co-op QR landing — un-hyphenated alias
 *
 * GET /WillyStCoop  ->  302  /WillyStCo-op
 *
 * The printed QR and the node's OLED both carry the hyphenated slug, but the
 * un-hyphenated spelling is the one people type from memory, and it 404'd. This
 * makes both work.
 *
 * It forwards to the canonical route rather than recording a scan itself. The
 * counter is keyed by slug (fresh_qr_scans.slug), so a second counting route
 * would split one QR's scans across two rows and quietly understate both. One
 * slug, one counter, one place that knows how counting works.
 *
 * The extra hop is deliberate and cheap: nobody scans this alias — a scanner
 * gets the hyphenated URL straight off the code — so the double redirect is
 * only ever paid by someone typing the address by hand.
 *
 * 302, not 301: a permanent redirect is cached indefinitely by browsers, and
 * this alias should stay re-pointable for exactly the reason the canonical
 * route documents — the QR can be aimed somewhere else later.
 */

import { Handlers } from '$fresh/server.ts';

/** The canonical route. It owns the scan counter and the wearable token. */
const CANONICAL = '/WillyStCo-op';

export const handler: Handlers = {
  GET(): Response {
    return new Response(null, {
      status: 302,
      headers: {
        location: CANONICAL,
        // Matches the canonical route. If a browser cached this hop it would
        // still land on /WillyStCo-op and still be counted, so this is belt
        // and braces rather than load-bearing -- but the two routes should not
        // disagree about caching.
        'cache-control': 'no-store',
      },
    });
  },
};
