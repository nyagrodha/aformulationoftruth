/** GET /api/mesh/question/next — the question the bridge should ask tonight. Bearer MESH_BRIDGE_TOKEN. */
import { Handlers } from '$fresh/server.ts';
import { bridgeAuth, json, nextIndex, questionText } from '../../../../lib/mesh.ts';
import { lastSent } from '../../../../lib/mesh-store.ts';

export const handler: Handlers = {
  async GET(req) {
    const denied = bridgeAuth(req, Deno.env.get('MESH_BRIDGE_TOKEN'));
    if (denied) return denied;
    try {
      const index = nextIndex((await lastSent())?.question_index ?? null);
      return json({ ok: true, question_index: index, text: questionText(index) });
    } catch {
      console.error('[mesh] next question lookup failed');
      return json({ ok: false }, 500);
    }
  },
};
