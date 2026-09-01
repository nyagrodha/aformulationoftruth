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
  const token = String(value ?? '').trim();
  if (!token) {
    throw new Response(JSON.stringify({ error: `${field} is required` }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
  if (token.length > maxLength) {
    throw new Response(JSON.stringify({ error: `${field} is too long` }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
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
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }
  return hash.startsWith('0x') ? hash.slice(2) : hash;
}

export function parseInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Response(
      JSON.stringify({ error: `${field} must be an integer` }),
      {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }
  return parsed;
}

export async function hashBytes(data: Uint8Array): Promise<Uint8Array> {
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export async function hashHex(value: string): Promise<string> {
  return bytesToHex(await hashBytes(new TextEncoder().encode(value)));
}

async function leafHash(commitment: string): Promise<Uint8Array> {
  return await hashBytes(new TextEncoder().encode(commitment));
}

export async function buildMerkleRoot(commitments: string[]): Promise<string> {
  if (commitments.length === 0) {
    throw new Response(JSON.stringify({ error: 'No commitments available' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  let level = await Promise.all(
    commitments.map((commitment) => leafHash(commitment)),
  );
  while (level.length > 1) {
    /*
     * Build every pair for the level first, then hash them in one Promise.all.
     * The pairs within a level are independent -- only the levels are ordered --
     * so awaiting inside the loop serialised work that had no reason to be
     * serial, one round trip to WebCrypto per node.
     */
    const pairs: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      const pair = new Uint8Array(left.length + right.length);
      pair.set(left);
      pair.set(right, left.length);
      pairs.push(pair);
    }
    level = await Promise.all(pairs.map((pair) => hashBytes(pair)));
  }
  return bytesToHex(level[0]);
}

export async function verifyMerkleProof(
  commitment: string,
  proofHashes: string[],
  leafIndex: number,
  merkleRoot: string,
): Promise<boolean> {
  let current = await leafHash(commitment);
  let index = leafIndex;

  for (const proofHash of proofHashes) {
    const sibling = hexToBytes(normalizeHashHex(proofHash, 'proof_hash'));
    const pair = new Uint8Array(current.length + sibling.length);
    if (index % 2 === 0) {
      pair.set(current);
      pair.set(sibling, current.length);
    } else {
      pair.set(sibling);
      pair.set(current, sibling.length);
    }
    current = await hashBytes(pair);
    index = Math.floor(index / 2);
  }

  return bytesToHex(current) === normalizeHashHex(merkleRoot, 'merkle_root');
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
  const template = Deno.env.get('LOTTO_DRAND_URL_TEMPLATE') ??
    'https://api.drand.sh/public/{round}';
  /*
   * drand is a third party on the network path of a draw. Without a deadline
   * this fetch can hang for as long as the peer keeps the socket open, and the
   * draw hangs with it.
   */
  let response: Response;
  try {
    response = await fetch(
      template.replace('{round}', String(roundNumber)),
      { signal: AbortSignal.timeout(10_000) },
    );
  } catch {
    throw new Response(
      JSON.stringify({ error: 'Unable to fetch drand randomness' }),
      {
        status: 502,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }
  if (!response.ok) {
    throw new Response(
      JSON.stringify({ error: 'Unable to fetch drand randomness' }),
      {
        status: 502,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }
  /*
   * A 200 whose body is not JSON -- a proxy's error page, a truncated
   * response -- rejects here rather than at the caller, where it would surface
   * as an unhandled SyntaxError instead of the 502 every other failure of this
   * function returns.
   */
  let beacon: { randomness?: string };
  try {
    beacon = await response.json() as { randomness?: string };
  } catch {
    throw new Response(
      JSON.stringify({ error: 'drand response was not valid JSON' }),
      {
        status: 502,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }

  const randomness = beacon.randomness?.trim().toLowerCase();
  if (!randomness) {
    throw new Response(
      JSON.stringify({ error: 'drand response missing randomness' }),
      {
        status: 502,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }
  /*
   * Validated before it reaches BigInt in chooseWinnerIndex. `BigInt("0x" + x)`
   * on a non-hex string throws a SyntaxError that escapes as a 500 with no
   * explanation, and drand's randomness is 32 bytes of hex or it is not
   * drand's randomness.
   */
  if (!/^[0-9a-f]{64}$/.test(randomness)) {
    throw new Response(
      JSON.stringify({ error: 'drand randomness is not 32-byte hex' }),
      {
        status: 502,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }

  return randomness;
}

export function chooseWinnerIndex(
  randomnessHex: string,
  entryCount: number,
): number {
  if (entryCount <= 0) {
    throw new Response(
      JSON.stringify({ error: 'entry_count must be positive' }),
      {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }
  return Number(BigInt(`0x${randomnessHex}`) % BigInt(entryCount));
}

/**
 * Compare two secrets without letting the clock describe them.
 *
 * `a !== b` on strings stops at the first differing character, so the time it
 * takes reports how long a shared prefix is -- and an attacker who can measure
 * it recovers the token one character at a time rather than guessing it whole.
 * Digesting both to a fixed 32 bytes first means the comparison is always over
 * the same length whatever the inputs were, then the loop ORs every byte so it
 * cannot exit early.
 *
 * @returns true when the two values are identical
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/**
 * A keyed receipt, so holding one proves the server issued it.
 *
 * The commit route used to return a bare SHA-256 of commitment, participant
 * token and timestamp -- all three of which the participant already has, so
 * anyone could compute a receipt for a commitment that was never recorded, and
 * the receipt attested to nothing. The key is what makes it evidence.
 *
 * Fails closed: without LOTTO_RECEIPT_SECRET no receipt is issued, rather than
 * one silently falling back to the unkeyed digest it is replacing.
 */
export async function hmacHex(message: string): Promise<string> {
  const secret = Deno.env.get('LOTTO_RECEIPT_SECRET');
  if (!secret) {
    throw new Response(
      JSON.stringify({ error: 'receipt signing is not configured' }),
      {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

export async function requireOperator(req: Request): Promise<void> {
  const configured = Deno.env.get('LOTTO_OPERATOR_TOKEN') ?? '';
  if (!configured) {
    throw new Response(
      JSON.stringify({ error: 'lotto operator token not configured' }),
      {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }
  const supplied = (req.headers.get('x-lotto-operator-token') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '').trim();
  if (!await timingSafeEqual(supplied, configured)) {
    throw new Response(
      JSON.stringify({ error: 'operator authorization failed' }),
      {
        status: 403,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }
}

export async function readJsonObject(
  req: Request,
): Promise<Record<string, unknown>> {
  const payload = await req.json();
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    throw new Response(
      JSON.stringify({ error: 'JSON payload must be an object' }),
      {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }
  return payload as Record<string, unknown>;
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
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
