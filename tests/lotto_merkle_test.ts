/**
 * Merkle commitment tree and winner selection for the zk lotto.
 *
 * The lotto's only claim on anyone's trust is that a stranger can recheck it:
 * the published root must pin down exactly which commitments were in the pool,
 * and the winner must be re-derivable from the drand round alone. These tests
 * pin the two properties that claim rests on.
 *
 *   1. The root BINDS the entry set. Duplicating a lone node to square off an
 *      odd level (CVE-2012-2459, the Bitcoin bug) lets [A,B,C] and [A,B,C,C]
 *      agree on a root, so a published root no longer says how many entries
 *      there were -- and winner_index is derived from that count.
 *
 *   2. Leaves and internal nodes live in SEPARATE HASH DOMAINS, so a value can
 *      never be read as the wrong kind of thing. Today only commit.ts's hex
 *      validation stands between the tree and a second-preimage forgery, which
 *      puts the safety of the tree in a different file from the tree.
 *
 * Winner selection is checked against the re-draw rule rather than a bare
 * modulo, because a verifier reimplementing the spec has to land on the same
 * index we did.
 */

import { assertEquals, assertNotEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildMerkleRoot, bytesToHex, chooseWinnerIndex, hashBytes, hashHex, verifyMerkleProof } from '../lib/lotto.ts';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const MAX_DRAW = 'f'.repeat(64);

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

Deno.test('buildMerkleRoot - an odd entry list does not collide with its padded twin', async () => {
  // [A,B,C] pairs as (A,B),(C,C). Duplicating the lone C makes that identical
  // to the honest pairing of [A,B,C,C], so one root describes two pools.
  assertNotEquals(
    await buildMerkleRoot([A, B, C]),
    await buildMerkleRoot([A, B, C, C]),
  );
});

Deno.test('buildMerkleRoot - a leaf is domain-separated from a bare hash of its commitment', async () => {
  // A single-leaf tree's root IS the leaf hash. Untagged it equals SHA-256 of
  // the commitment text, which is the same shape an internal node consumes.
  assertNotEquals(await buildMerkleRoot([A]), await hashHex(A));
});

Deno.test('buildMerkleRoot - an internal node is domain-separated from a bare hash of its children', async () => {
  const leafA = hexToBytes(await buildMerkleRoot([A]));
  const leafB = hexToBytes(await buildMerkleRoot([B]));
  const naive = new Uint8Array(leafA.length + leafB.length);
  naive.set(leafA);
  naive.set(leafB, leafA.length);

  assertNotEquals(
    await buildMerkleRoot([A, B]),
    bytesToHex(await hashBytes(naive)),
  );
});

Deno.test('verifyMerkleProof - a proof for a committed leaf still validates', async () => {
  // Regression guard across the hashing change: for a two-leaf tree the proof
  // for leaf 0 is simply the sibling leaf hash.
  const root = await buildMerkleRoot([A, B]);
  const siblingLeaf = await buildMerkleRoot([B]);

  assertEquals(await verifyMerkleProof(A, [siblingLeaf], 0, root), true);
});

Deno.test('verifyMerkleProof - a proof for an uncommitted leaf is refused', async () => {
  const root = await buildMerkleRoot([A, B]);
  const siblingLeaf = await buildMerkleRoot([B]);

  assertEquals(await verifyMerkleProof(C, [siblingLeaf], 0, root), false);
});

Deno.test('chooseWinnerIndex - the largest draw is re-drawn rather than folded', async () => {
  // 2^256 mod 7 == 2, so the two largest draws -- all ones among them -- fall
  // outside the largest exact multiple of 7 and must be re-drawn. Folding one
  // instead is what tips the odds toward the low indices.
  //
  // 7 is chosen so the two outcomes actually differ: at n == 3 the folded and
  // re-drawn answers are both 0 and this test would pass without proving a
  // thing. The assertNotEquals below keeps it that way if anyone retunes it.
  const redrawn = await hashHex(`lotto/winner/v1:${MAX_DRAW}:0`);
  const expected = Number(BigInt(`0x${redrawn}`) % 7n);
  const folded = Number((2n ** 256n - 1n) % 7n);

  assertNotEquals(expected, folded, 'test is vacuous unless these differ');
  assertEquals(await chooseWinnerIndex(MAX_DRAW, 7), expected);
});

Deno.test('chooseWinnerIndex - an in-window draw is used directly', async () => {
  const randomness = '00'.repeat(31) + '07';

  assertEquals(await chooseWinnerIndex(randomness, 5), 2);
});

Deno.test('chooseWinnerIndex - is deterministic for the same round and pool', async () => {
  assertEquals(
    await chooseWinnerIndex(MAX_DRAW, 7),
    await chooseWinnerIndex(MAX_DRAW, 7),
  );
});

Deno.test('chooseWinnerIndex - refuses a non-positive entry count', async () => {
  await assertRejects(() => Promise.resolve(chooseWinnerIndex(A, 0)));
});
