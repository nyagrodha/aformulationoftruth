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
  /*
   * Missing or wrong-typed commitments used to fall through to []. A round then
   * closed on an empty list: buildMerkleRoot produced a root over nothing and
   * computeAnchorHash anchored it, so the round was sealed, published, and
   * unenterable -- with a 200 and entry_count 0 as the only sign. Refuse.
   */
  throw new Response(
    JSON.stringify({ error: 'commitments must be a list or newline-separated string' }),
    { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
}

function readClaimWindowDays(): number {
  const raw = Deno.env.get('LOTTO_CLAIM_WINDOW_DAYS') ?? '7';
  const days = Number(raw);
  if (!Number.isInteger(days) || days <= 0) {
    throw new Response(
      JSON.stringify({ error: 'claim window is not configured correctly' }),
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
  return days;
}

export const handler: Handlers = {
  async POST(req) {
    try {
      await requireOperator(req);
      const payload = await readJsonObject(req);
      const commitments = normalizeCommitmentList(payload.commitments);
      if (commitments.length === 0) {
        return json({ error: 'a round cannot be closed with no commitments' }, { status: 400 });
      }
      const merkleRoot = await buildMerkleRoot(commitments);
      const drandRound = parseInteger(
        payload.drand_round ??
          Deno.env.get('LOTTO_DEFAULT_DRAND_ROUND_TARGET') ?? 0,
        'drand_round',
      );
      /*
       * LOTTO_CLAIM_WINDOW_DAYS is this server's configuration, not the
       * caller's input, so a bad value must not be reported as a bad request.
       * parseInteger throws a 400 Response, and inside this try that is exactly
       * what the operator saw: "invalid LOTTO_CLAIM_WINDOW_DAYS" as a client
       * error on a payload that was perfectly correct.
       */
      const claimWindowDays = readClaimWindowDays();
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
