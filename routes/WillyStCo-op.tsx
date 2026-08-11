/**
 * Willy St Co-op QR landing
 *
 * GET /WillyStCo-op
 *
 * The QR on the co-op node points here. This route records the visit and
 * forwards to the wearable page, which greets the scanner and leads into the
 * site's normal entry ritual.
 *
 * Counting lives here rather than on /w/:token so the vanity URL and its
 * counter stay together, the wearable page is untouched, and the QR can later
 * be re-pointed elsewhere without moving the counter. The two numbers answer
 * different questions: scans (fresh_qr_scans) and conversions
 * (fresh_encounters, recorded by gate-submit when an email is left).
 *
 * Privacy: the slug never reaches the scanner's browser -- the redirect names
 * only the opaque wearable token, so the URL they see does not name a place.
 * No address or user agent is stored; see lib/qr-scans.ts.
 *
 * Spec: docs/superpowers/specs/2026-08-11-coop-qr-scan-counting-design.md
 */

import { Handlers } from '$fresh/server.ts';
import { getClientIp } from '../lib/client-ip.ts';
import { increment } from '../lib/metrics.ts';
import { recordScan, withDeadline } from '../lib/qr-scans.ts';

/** Matches the counter's slug column; also the name of this file's route. */
const SLUG = 'WillyStCo-op';

/**
 * How long the redirect will wait on the counter. Generous for a single
 * INSERT on a warm pool, short enough that a stalled database costs the
 * scanner a beat rather than the page.
 */
const RECORD_DEADLINE_MS = 1500;

/** Same shape tools/seed-wearable.ts mints and /w/[token] accepts. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Where a scanner is sent. The token is configuration, not code: the co-op
 * drop has its own site-owned wearable row, and a QR printed in a public
 * shop makes that token public by definition -- so it must never be a
 * personal one, whose bearer credential would graft every passerby onto a
 * real person's graph (see tools/seed-wearable.ts).
 */
function destination(): string {
  const token = Deno.env.get('COOP_WEARABLE_TOKEN') ?? '';
  if (!TOKEN_PATTERN.test(token)) {
    // Unseeded or malformed is an operator error, not the scanner's problem.
    // The entry ritual is a better landing than a 404 on a printed code.
    increment('errors.config.qr_token_missing');
    return '/';
  }
  return `/w/${token}`;
}

export const handler: Handlers = {
  async GET(req, ctx) {
    const remoteHost = (ctx as { remoteAddr?: { hostname?: string } }).remoteAddr?.hostname;

    try {
      // Bounded, not merely wrapped. try/catch handles a database that fails;
      // it does nothing for one that stalls, and a stalled pool would hold the
      // redirect until an upstream timeout -- leaving someone standing in a
      // shop looking at a spinner. Losing a count is the cheaper failure.
      await withDeadline(
        recordScan(
          SLUG,
          getClientIp(req, remoteHost),
          req.headers.get('user-agent') ?? '',
        ),
        RECORD_DEADLINE_MS,
      );
      increment('qr.scan.recorded');
    } catch {
      // Never let counting break the redirect. Category only -- the error may
      // carry the address, and scripts/check-zero-logging.sh forbids emitting
      // it. The metric is how this failure becomes visible.
      increment('errors.db.qr_scan');
    }

    return new Response(null, {
      status: 302,
      headers: {
        location: destination(),
        // A cached redirect would be served by the browser without ever
        // reaching this handler, and the scan would go uncounted.
        'cache-control': 'no-store',
      },
    });
  },
};
