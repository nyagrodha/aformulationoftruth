/** GET /api/mesh/question/current — the latest sending, for a bridge recovering after a restart. */
import { Handlers } from '$fresh/server.ts';
import { bridgeAuth, json, questionText } from '../../../../lib/mesh.ts';
import { lastSent } from '../../../../lib/mesh-store.ts';

export const handler: Handlers = {
  async GET(req) {
    const denied = bridgeAuth(req, Deno.env.get('MESH_BRIDGE_TOKEN'));
    if (denied) return denied;
    try {
      const row = await lastSent();
      if (!row) return json({ ok: false }, 404);
      return json({
        ok: true,
        question_index: row.question_index,
        packet_id: row.packet_id,
        sent_at: row.sent_at.toISOString(),
        text: questionText(row.question_index),
      });
    } catch {
      console.error('[mesh] current question lookup failed');
      return json({ ok: false }, 500);
    }
  },
};
