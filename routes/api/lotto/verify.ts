import { Handlers } from "$fresh/server.ts";
import {
  json,
  normalizeHashHex,
  parseInteger,
  readJsonObject,
  verifyMerkleProof,
} from "../../../lib/lotto.ts";

function normalizeProof(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) return value.map((item) => String(item));
  return [];
}

export const handler: Handlers = {
  async POST(req) {
    try {
      const payload = await readJsonObject(req);
      const commitment = normalizeHashHex(payload.commitment, "commitment");
      const leafIndex = parseInteger(payload.leaf_index, "leaf_index");
      const entryCount = parseInteger(payload.entry_count, "entry_count");
      const merkleRoot = normalizeHashHex(payload.merkle_root, "merkle_root");
      const valid = await verifyMerkleProof(
        commitment,
        normalizeProof(payload.proof),
        leafIndex,
        entryCount,
        merkleRoot,
      );
      return json({ ok: true, valid });
    } catch (error) {
      if (error instanceof Response) return error;
      return json({ error: "Invalid JSON payload" }, { status: 400 });
    }
  },
};
