/** POST /api/mesh/forget — a node DMed "forget": hide everything it posted. */
import { Handlers } from '$fresh/server.ts';
import { bridgeAuth, json, validateForget } from '../../../lib/mesh.ts';
import { forget } from '../../../lib/mesh-store.ts';

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
    const v = validateForget(body);
    if (!v.ok) return json({ ok: false, error: v.error }, 400);
    try {
      return json({ ok: true, hidden: await forget(v.value.from_id) });
    } catch {
      console.error('[mesh] forget failed');
      return json({ ok: false }, 500);
    }
  },
};
