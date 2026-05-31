import { Handlers } from "$fresh/server.ts";
import {
  hashHex,
  json,
  normalizeHashHex,
  normalizeToken,
  readJsonObject,
} from "../../../utils/lotto.ts";

export const handler: Handlers = {
  async POST(req) {
    try {
      const payload = await readJsonObject(req);
      const commitment = normalizeHashHex(payload.commitment, "commitment");
      const participantToken = normalizeToken(
        payload.participant_token ?? "anonymous",
        "participant_token",
      );
      const receivedAt = new Date().toISOString();
      const receipt = await hashHex(
        `${commitment}:${participantToken}:${receivedAt}`,
      );
      return json({ ok: true, commitment, receipt, received_at: receivedAt });
    } catch (error) {
      if (error instanceof Response) return error;
      return json({ error: "Invalid JSON payload" }, { status: 400 });
    }
  },
};
