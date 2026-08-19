/**
 * Delivery Confirmation Callback
 *
 * POST /api/responses/delivered
 *
 * The key box calls this after it has mailed a respondent their document. It
 * is the only thing that ever stamps `pdf_delivered_at`, because the web tier
 * cannot observe the send: it handed over ciphertext it cannot read and got
 * back a 200 that means "accepted", not "delivered".
 *
 * The counterpart on the other side is `notifyDelivered` in
 * romania/render-service.ts. That code has existed since the delivery half
 * shipped; this route did not, so every callback 404'd and no row was ever
 * stamped. Set RENDER_CALLBACK_URL on the key box to
 * `https://aformulationoftruth.com/api/responses` and RENDER_CALLBACK_TOKEN to
 * the same value both sides hold, or this stays decorative.
 *
 * Nothing here decrypts anything. A session id and a timestamp are the whole
 * of the payload.
 */

import { Handlers } from '$fresh/server.ts';
import { timingSafeEqual } from '$std/crypto/timing_safe_equal.ts';
import { withConnection } from '../../../lib/db.ts';
import { increment } from '../../../lib/metrics.ts';

/** Same shape the key box validates before it will load a key. */
const SESSION_ID = /^[0-9a-fA-F-]{8,64}$/;

const RESPONSE_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

/**
 * Compare the presented bearer token against the configured one.
 *
 * Constant-time, and length-safe: timingSafeEqual throws on a length mismatch,
 * which would itself be an oracle, so the lengths are compared first and a
 * mismatch short-circuits to false rather than propagating.
 */
function tokenMatches(presented: string, configured: string): boolean {
  const a = new TextEncoder().encode(presented);
  const b = new TextEncoder().encode(configured);
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

export const handler: Handlers = {
  async POST(req, _ctx) {
    increment('requests.api');

    const configured = Deno.env.get('RENDER_CALLBACK_TOKEN') || '';
    if (!configured) {
      // Fail closed. An unset token must not mean "let anyone stamp rows".
      increment('delivery.callback_unconfigured');
      console.error('[delivered] RENDER_CALLBACK_TOKEN not set; refusing');
      return new Response(JSON.stringify({ ok: false }), { status: 503, headers: RESPONSE_HEADERS });
    }

    const authorization = req.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ') || !tokenMatches(authorization.slice(7), configured)) {
      increment('delivery.callback_unauthorized');
      return new Response(JSON.stringify({ ok: false }), { status: 401, headers: RESPONSE_HEADERS });
    }

    let sessionId: unknown;
    try {
      sessionId = (await req.json())?.sessionId;
    } catch {
      return new Response(JSON.stringify({ ok: false }), { status: 400, headers: RESPONSE_HEADERS });
    }

    // The id becomes a query parameter, not a filename, so injection is not the
    // risk here — but an id of the wrong shape means the two sides disagree
    // about what a session is, and that is worth a 400 rather than a no-op.
    if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) {
      increment('errors.4xx');
      return new Response(JSON.stringify({ ok: false }), { status: 400, headers: RESPONSE_HEADERS });
    }

    try {
      // One round trip, and it distinguishes the three outcomes that matter.
      // Write-once, mirroring markDelivered on the key box: a re-send must not
      // move the timestamp, because the 7-day shred clock runs from the FIRST
      // delivery and a respondent asking for another copy every few days would
      // otherwise keep a private key alive indefinitely.
      const result = await withConnection(async (client) => {
        const r = await client.queryObject<{ matched: bigint; stamped: bigint }>(
          `WITH matched AS (
             SELECT 1 FROM fresh_gate_responses WHERE linked_session_id = $1
           ), stamped AS (
             UPDATE fresh_gate_responses
                SET pdf_delivered_at = NOW()
              WHERE linked_session_id = $1
                AND pdf_delivered_at IS NULL
             RETURNING 1
           )
           SELECT (SELECT count(*) FROM matched) AS matched,
                  (SELECT count(*) FROM stamped) AS stamped`,
          [sessionId],
        );
        return r.rows[0];
      });

      if (!result || result.matched === 0n) {
        // The key box delivered for a session this tier has no row for. That is
        // a real inconsistency, not a routine miss, and saying 404 is what lets
        // the caller log it instead of assuming success.
        increment('delivery.confirm_unknown_session');
        console.error('[delivered] no row for the confirmed session');
        return new Response(JSON.stringify({ ok: false }), { status: 404, headers: RESPONSE_HEADERS });
      }

      increment(result.stamped > 0n ? 'delivery.confirmed' : 'delivery.confirmed_duplicate');
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: RESPONSE_HEADERS });
    } catch {
      // Category only: the thrown error can carry the connection string.
      console.error('[delivered] stamping delivery failed');
      increment('errors.5xx');
      return new Response(JSON.stringify({ ok: false }), { status: 500, headers: RESPONSE_HEADERS });
    }
  },
};
