import { Handlers } from '$fresh/server.ts';
import { json, normalizeHashHex, parseInteger, readJsonObject, verifyMerkleProof } from '../../../lib/lotto.ts';

/*
 * Every element is validated the way commitment and merkle_root are.
 *
 * The string branch trimmed and passed through unchecked; the array branch ran
 * String() over whatever arrived, so `[null, {}]` became "null" and
 * "[object Object]" and went to verifyMerkleProof as hashes. Neither is 32-byte
 * hex, so the answer was always a plain `valid: false` -- indistinguishable
 * from a proof that was well-formed and simply wrong, which is the one thing
 * this endpoint exists to tell apart. normalizeHashHex throws a 400 naming the
 * field instead.
 */
function normalizeProof(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.split(/\n+/).map((item) => item.trim()).filter(Boolean).map((
      item,
    ) => normalizeHashHex(item, 'proof'));
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeHashHex(item, 'proof'));
  }
  return [];
}

export const handler: Handlers = {
  async POST(req) {
    try {
      const payload = await readJsonObject(req);
      const commitment = normalizeHashHex(payload.commitment, 'commitment');
      const leafIndex = parseInteger(payload.leaf_index, 'leaf_index');
      const merkleRoot = normalizeHashHex(payload.merkle_root, 'merkle_root');
      const valid = await verifyMerkleProof(
        commitment,
        normalizeProof(payload.proof),
        leafIndex,
        merkleRoot,
      );
      return json({ ok: true, valid });
    } catch (error) {
      if (error instanceof Response) return error;
      return json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
  },
};
