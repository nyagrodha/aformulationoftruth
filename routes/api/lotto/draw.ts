import { Handlers } from "$fresh/server.ts";
import {
  chooseWinnerIndex,
  fetchDrandRandomness,
  json,
  parseInteger,
  readJsonObject,
  requireOperator,
} from "../../../lib/lotto.ts";

export const handler: Handlers = {
  async POST(req) {
    try {
      requireOperator(req);
      let payload: Record<string, unknown>;
      try {
        payload = await readJsonObject(req);
      } catch (parseError) {
        if (parseError instanceof Response) throw parseError;
        return json({ error: "Invalid JSON payload" }, { status: 400 });
      }
      const entryCount = parseInteger(payload.entry_count, "entry_count");
      const drandRound = parseInteger(payload.drand_round, "drand_round");
      const randomness = await fetchDrandRandomness(drandRound);
      return json({
        ok: true,
        drand_round: drandRound,
        randomness,
        winner_index: chooseWinnerIndex(randomness, entryCount),
      });
    } catch (error) {
      if (error instanceof Response) return error;
      return json({ error: "Internal server error" }, { status: 500 });
    }
  },
};
