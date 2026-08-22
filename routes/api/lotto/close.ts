import { Handlers } from '$fresh/server.ts';
import {
  buildMerkleRoot,
  computeAnchorHash,
  json,
  normalizeHashHex,
  parseInteger,
  readJsonObject,
  requireOperator,
} from '../../../lib/lotto.ts';

function normalizeCommitmentList(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.split(/\n+/).map((item) => item.trim()).filter(Boolean).map((
      item,
    ) => normalizeHashHex(item, 'commitment'));
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeHashHex(item, 'commitment'));
  }
  return [];
}

export const handler: Handlers = {
  async POST(req) {
    try {
      requireOperator(req);
      const payload = await readJsonObject(req);
      const commitments = normalizeCommitmentList(payload.commitments);
      const merkleRoot = await buildMerkleRoot(commitments);
      const drandRound = parseInteger(
        payload.drand_round ??
          Deno.env.get('LOTTO_DEFAULT_DRAND_ROUND_TARGET') ?? 0,
        'drand_round',
      );
      const claimWindowDays = parseInteger(
        Deno.env.get('LOTTO_CLAIM_WINDOW_DAYS') ?? 7,
        'LOTTO_CLAIM_WINDOW_DAYS',
      );
      const claimDeadline = new Date(Date.now() + claimWindowDays * 86_400_000)
        .toISOString();
      const anchorHash = await computeAnchorHash(
        merkleRoot,
        commitments.length,
        drandRound,
      );
      return json({
        ok: true,
        entry_count: commitments.length,
        merkle_root: merkleRoot,
        drand_round: drandRound,
        anchor_hash: anchorHash,
        claim_deadline: claimDeadline,
      });
    } catch (error) {
      if (error instanceof Response) return error;
      return json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
  },
};
