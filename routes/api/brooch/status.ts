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

/** Reads at most `cap` bytes of the body; null if it is longer (the rest is never buffered). */
async function readCapped(req: Request, cap: number): Promise<string | null> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

export const handler: Handlers = {
  async POST(req) {
    increment('requests.api');
    const declared = req.headers.get('content-length');
    if (declared !== null && !(Number(declared) <= MAX_BODY)) return json(404, { error: 'not found' });
    const text = await readCapped(req, MAX_BODY);
    if (text === null) return json(404, { error: 'not found' });
    let code: unknown;
    try {
      code = JSON.parse(text)?.code;
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
