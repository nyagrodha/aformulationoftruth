/** POST /api/mesh/answers — an answer heard on the mesh. Public by design; see lib/mesh.ts. */
import { Handlers } from '$fresh/server.ts';
import { bridgeAuth, json, validateAnswer } from '../../../lib/mesh.ts';
import { type AnswerResult, insertAnswer } from '../../../lib/mesh-store.ts';

const OUTCOME: Record<AnswerResult, [number, Record<string, unknown>]> = {
  inserted: [201, { ok: true }],
  duplicate: [200, { ok: true, duplicate: true }],
  no_question: [422, { ok: false, reason: 'no_question' }],
  rate_node: [429, { ok: false, reason: 'rate_node' }],
  rate_day: [429, { ok: false, reason: 'rate_day' }],
};

export const handler: Handlers = {
  async POST(req) {
    const denied = bridgeAuth(req, Deno.env.get('MESH_BRIDGE_TOKEN'));
    if (denied) return denied;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'body' }, 400);
    }
    const v = validateAnswer(body);
    if (!v.ok) return json({ ok: false, error: v.error }, 400);
    try {
      const [status, out] = OUTCOME[await insertAnswer(v.value)];
      return json(out, status);
    } catch {
      console.error('[mesh] storing an answer failed');
      return json({ ok: false }, 500);
    }
  },
};
