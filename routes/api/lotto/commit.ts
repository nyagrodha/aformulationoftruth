import { Handlers } from '$fresh/server.ts';
import { hmacHex, json, normalizeHashHex, normalizeToken, readJsonObject } from '../../../lib/lotto.ts';

export const handler: Handlers = {
  async POST(req) {
    try {
      const payload = await readJsonObject(req);
      const commitment = normalizeHashHex(payload.commitment, 'commitment');
      const participantToken = normalizeToken(
        payload.participant_token ?? 'anonymous',
        'participant_token',
      );
      const receivedAt = new Date().toISOString();
      /*
       * Keyed, not a bare digest. Every input here is known to whoever posted
       * the commitment, so an unkeyed hash of them is something the client can
       * compute for a commitment the server never saw -- a receipt that proves
       * nothing is worse than none, because it is presented as proof.
       */
      const receipt = await hmacHex(
        `${commitment}:${participantToken}:${receivedAt}`,
      );
      return json({ ok: true, commitment, receipt, received_at: receivedAt });
    } catch (error) {
      if (error instanceof Response) return error;
      return json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
  },
};
