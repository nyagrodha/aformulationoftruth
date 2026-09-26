/**
 * POST /api/mesh/question/sent — the bridge sent tonight's question under this packet id.
 * 409 carries today's stored row, so a retry after a lost 201 can see it was its own.
 */
import { Handlers } from '$fresh/server.ts';
import { bridgeAuth, json, validateSent } from '../../../../lib/mesh.ts';
import { recordSent } from '../../../../lib/mesh-store.ts';

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
    const v = validateSent(body);
    if (!v.ok) return json({ ok: false, error: v.error }, 400);
    try {
      const { status, row } = await recordSent(v.value.question_index, v.value.packet_id);
      return json(
        { ok: status === 'inserted', question_index: row.question_index, packet_id: row.packet_id },
        status === 'inserted' ? 201 : 409,
      );
    } catch {
      console.error('[mesh] recording a sent question failed');
      return json({ ok: false }, 500);
    }
  },
};
