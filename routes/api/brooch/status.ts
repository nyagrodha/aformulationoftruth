/**
 * Brooch scan status
 *
 * POST /api/brooch/status   {"code": "<27 chars>"}  ->  {"state": "fresh"|"redeemed"|"stale"}
 *
 * Polled by a brooch while its QR is on screen, so it can cycle in the next
 * one the moment this one is scanned. The code travels in the body so it never
 * reaches an access log. Knowing the code is the only credential: whoever can
 * ask has already seen it on the brooch. Read-only.
 *
 * Deliberately NOT behind lib/api-auth.ts: its same-origin check would refuse
 * the brooch, which is not a browser and sends no Origin.
 */
import { Handlers } from '$fresh/server.ts';
import { codeStatus } from '../../../lib/brooch.ts';
import { CODE_RE } from '../../../lib/brooch_code.ts';
import { increment } from '../../../lib/metrics.ts';

/** Test seam. */
export const brooch: { status: typeof codeStatus } = { status: codeStatus };

const MAX_BODY = 256;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const handler: Handlers = {
  async POST(req) {
    increment('requests.api');
    const text = await req.text();
    let code: unknown;
    try {
      code = text.length <= MAX_BODY ? JSON.parse(text)?.code : undefined;
    } catch {
      code = undefined;
    }
    if (typeof code !== 'string' || !CODE_RE.test(code)) return json(404, { error: 'not found' });

    try {
      const state = await brooch.status(code);
      if (!state) return json(404, { error: 'not found' });
      increment(`brooch.status.${state}`);
      return json(200, { state });
    } catch {
      // Category only: the error could carry the query and its parameters.
      console.error('[brooch-status] lookup failed');
      increment('errors.5xx');
      return json(503, { error: 'unavailable' });
    }
  },
};
