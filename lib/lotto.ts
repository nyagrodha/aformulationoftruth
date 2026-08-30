const HEX_32_BYTE_RE = /^(?:0x)?[0-9a-fA-F]{64}$/;

export interface LottoCloseResult {
  ok: true;
  entry_count: number;
  merkle_root: string;
  drand_round: number;
  anchor_hash: string;
  claim_deadline: string;
}

export function normalizeToken(
  value: unknown,
  field: string,
  maxLength = 256,
): string {
  const token = String(value ?? "").trim();
  if (!token) {
    throw new Response(JSON.stringify({ error: `${field} is required` }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  if (token.length > maxLength) {
    throw new Response(JSON.stringify({ error: `${field} is too long` }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  return token;
}

export function normalizeHashHex(value: unknown, field: string): string {
  const hash = normalizeToken(value, field, 66).toLowerCase();
  if (!HEX_32_BYTE_RE.test(hash)) {
    throw new Response(
      JSON.stringify({ error: `${field} must be 32-byte hex` }),
      {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }
  return hash.startsWith("0x") ? hash.slice(2) : hash;
}

export function parseInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Response(
      JSON.stringify({ error: `${field} must be an integer` }),
      {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }
  return parsed;
}

export async function hashBytes(data: Uint8Array): Promise<Uint8Array> {
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function hashHex(value: string): Promise<string> {
  return bytesToHex(await hashBytes(new TextEncoder().encode(value)));
}

/**
 * Leaves and internal nodes are hashed in separate domains, so a value can
 * never be mistaken for the other kind. Without the tags a leaf hash is a bare
 * SHA-256 over 64 bytes and so is an internal node's preimage, and the only
 * thing standing between the tree and a second-preimage forgery is commit.ts
 * validating commitments as hex -- security living in a different file from
 * the thing it secures. The tags follow RFC 6962.
 */
const LEAF_TAG = 0x00;
const NODE_TAG = 0x01;

async function leafHash(commitment: string): Promise<Uint8Array> {
  const body = new TextEncoder().encode(commitment);
  const tagged = new Uint8Array(1 + body.length);
  tagged[0] = LEAF_TAG;
  tagged.set(body, 1);
  return await hashBytes(tagged);
}

async function nodeHash(
  left: Uint8Array,
  right: Uint8Array,
): Promise<Uint8Array> {
  const tagged = new Uint8Array(1 + left.length + right.length);
  tagged[0] = NODE_TAG;
  tagged.set(left, 1);
  tagged.set(right, 1 + left.length);
  return await hashBytes(tagged);
}

export async function buildMerkleRoot(commitments: string[]): Promise<string> {
  if (commitments.length === 0) {
    throw new Response(JSON.stringify({ error: "No commitments available" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  let level = await Promise.all(
    commitments.map((commitment) => leafHash(commitment)),
  );
  while (level.length > 1) {
    const nextLevel: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1];
      // A lone node is carried up unchanged. Duplicating it instead -- the
      // Bitcoin bug, CVE-2012-2459 -- lets [A,B,C] and [A,B,C,C] agree on a
      // root, so the root stops pinning down how many entries there were.
      // winner_index is derived from that count.
      nextLevel.push(
        right === undefined ? left : await nodeHash(left, right),
      );
    }
    level = nextLevel;
  }
  return bytesToHex(level[0]);
}

/**
 * Recheck that a commitment sits in the tree under `merkleRoot`.
 *
 * The proof is read against the tree's WIDTH, not just its own length. Since a
 * lone node is carried up unpaired, some levels spend no hash at all, and a
 * verifier that simply walked the supplied hashes would lose track of which
 * level it was on and pair the last leaf of an odd tree against the wrong
 * side -- rejecting a commitment that really is in the tree. Knowing
 * `entryCount` is what says where those gaps fall. This mirrors RFC 6962,
 * where an audit path is defined relative to the tree size.
 */
export async function verifyMerkleProof(
  commitment: string,
  proofHashes: string[],
  leafIndex: number,
  entryCount: number,
  merkleRoot: string,
): Promise<boolean> {
  if (
    !Number.isInteger(entryCount) || entryCount <= 0 ||
    !Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= entryCount
  ) {
    return false;
  }

  let current = await leafHash(commitment);
  let index = leafIndex;
  let width = entryCount;
  let consumed = 0;

  while (width > 1) {
    // Last node of an odd level: it was carried up untouched, so this level
    // contributes no sibling and the proof spends nothing here.
    const promoted = width % 2 === 1 && index === width - 1;
    if (!promoted) {
      if (consumed >= proofHashes.length) return false;
      const sibling = hexToBytes(
        normalizeHashHex(proofHashes[consumed], "proof_hash"),
      );
      consumed += 1;
      current = index % 2 === 0
        ? await nodeHash(current, sibling)
        : await nodeHash(sibling, current);
    }
    index = Math.floor(index / 2);
    width = Math.ceil(width / 2);
  }

  // Hashes left over describe some other tree, so the proof does not hold.
  if (consumed !== proofHashes.length) return false;

  return bytesToHex(current) === normalizeHashHex(merkleRoot, "merkle_root");
}

export async function computeAnchorHash(
  merkleRoot: string,
  entryCount: number,
  drandRound: number,
): Promise<string> {
  return await hashHex(`${merkleRoot}:${entryCount}:${drandRound}`);
}

export async function fetchDrandRandomness(
  roundNumber: number,
): Promise<string> {
  const template = Deno.env.get("LOTTO_DRAND_URL_TEMPLATE") ??
    "https://api.drand.sh/public/{round}";
  const response = await fetch(
    template.replace("{round}", String(roundNumber)),
  );
  if (!response.ok) {
    throw new Response(
      JSON.stringify({ error: "Unable to fetch drand randomness" }),
      {
        status: 502,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }
  const beacon = await response.json() as { randomness?: string };
  const randomness = beacon.randomness?.trim().toLowerCase();
  if (!randomness) {
    throw new Response(
      JSON.stringify({ error: "drand response missing randomness" }),
      {
        status: 502,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }
  return randomness;
}

/** drand randomness is 32 bytes, so a draw spans [0, 2^256). */
const DRAW_RANGE = 1n << 256n;

/** A re-draw needs a bound; at 2^256 the loop cannot plausibly reach it. */
const MAX_REDRAWS = 128;

/**
 * Pick the winning index from a drand round.
 *
 * Folding the draw with a bare modulo tips the odds toward the low indices
 * whenever the pool size does not divide the range evenly. At 256 bits the
 * effect is far too small to observe -- but the lotto's whole claim is that a
 * stranger can recheck it, and "the bias is about n/2^256, so relax" is an
 * arithmetic argument a reader has to take on faith. Rejecting the draws that
 * fall outside the largest exact multiple of the pool size costs a branch that
 * essentially never fires and leaves nothing to take on faith.
 *
 * A re-draw is DERIVED, never freshly fetched: a verifier holds only the
 * published round and must land on the same index we did.
 */
export async function chooseWinnerIndex(
  randomnessHex: string,
  entryCount: number,
): Promise<number> {
  if (entryCount <= 0) {
    throw new Response(
      JSON.stringify({ error: "entry_count must be positive" }),
      {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }

  const normalized = normalizeHashHex(randomnessHex, "randomness");
  const pool = BigInt(entryCount);
  const window = DRAW_RANGE - (DRAW_RANGE % pool);

  let draw = BigInt(`0x${normalized}`);
  for (let redraws = 0; draw >= window; redraws++) {
    if (redraws >= MAX_REDRAWS) {
      throw new Response(
        JSON.stringify({ error: "winner selection failed to converge" }),
        {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8" },
        },
      );
    }
    draw = BigInt(
      `0x${await hashHex(`lotto/winner/v1:${normalized}:${redraws}`)}`,
    );
  }
  return Number(draw % pool);
}

export function requireOperator(req: Request): void {
  const configured = Deno.env.get("LOTTO_OPERATOR_TOKEN") ?? "";
  if (!configured) {
    throw new Response(
      JSON.stringify({ error: "lotto operator token not configured" }),
      {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }
  const supplied = (req.headers.get("x-lotto-operator-token") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "").trim();
  if (supplied !== configured) {
    throw new Response(
      JSON.stringify({ error: "operator authorization failed" }),
      {
        status: 403,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }
}

export async function readJsonObject(
  req: Request,
): Promise<Record<string, unknown>> {
  const payload = await req.json();
  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw new Response(
      JSON.stringify({ error: "JSON payload must be an object" }),
      {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }
  return payload as Record<string, unknown>;
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
