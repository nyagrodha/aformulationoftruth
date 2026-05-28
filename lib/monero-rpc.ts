/**
 * Minimal JSON-RPC client for monero-wallet-rpc running on the Pi,
 * reached over Tor hidden service. Speaks HTTP Digest (RFC 7616 MD5)
 * because that's the wallet-rpc default with `--rpc-login user:pass`.
 *
 * Why no library:
 *   - The full dance is one challenge + one authenticated POST.
 *   - Deno already has `createHttpClient` with `socks5h://` proxy,
 *     so the .onion is resolved at the Tor endpoint.
 *   - Avoids npm deps on a privacy-critical path.
 */

import { crypto as stdCrypto } from '$std/crypto/mod.ts';

const encoder = new TextEncoder();

async function md5Hex(input: string): Promise<string> {
  const buf = await stdCrypto.subtle.digest('MD5', encoder.encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function parseChallenge(header: string): Record<string, string> {
  // `Digest realm="x", nonce="y", qop="auth", algorithm=MD5, ...`
  const out: Record<string, string> = {};
  const rest = header.replace(/^Digest\s+/i, '');
  // split on commas, but tolerate commas inside quoted values
  for (const part of rest.match(/[a-zA-Z]+=(?:"[^"]*"|[^,]+)/g) ?? []) {
    const eq = part.indexOf('=');
    const k = part.slice(0, eq).trim();
    let v = part.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
}

let cachedClient: Deno.HttpClient | null = null;
function client(): Deno.HttpClient {
  if (cachedClient) return cachedClient;
  const proxy = Deno.env.get('MONERO_TOR_SOCKS') || 'socks5h://127.0.0.1:9050';
  cachedClient = Deno.createHttpClient({ proxy: { url: proxy } });
  return cachedClient;
}

interface RpcOptions {
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

/**
 * One round trip with HTTP Digest auth. Returns the parsed JSON-RPC result
 * or throws on any failure (network, auth, RPC-level error).
 */
export async function rpc<T = unknown>(opts: RpcOptions): Promise<T> {
  const url = Deno.env.get('MONERO_RPC_URL');
  const user = Deno.env.get('MONERO_RPC_USER');
  const pass = Deno.env.get('MONERO_RPC_PASS');
  if (!url) throw new Error('MONERO_RPC_URL not configured');

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 0,
    method: opts.method,
    params: opts.params ?? {},
  });
  const path = new URL(url).pathname || '/json_rpc';

  // 1. Unauthenticated probe to grab the Digest challenge
  const probe = await fetch(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      client: client(),
    } as RequestInit & { client: Deno.HttpClient },
  );

  if (probe.status === 200) {
    return ((await probe.json()) as JsonRpcResponse<T>).result as T;
  }
  if (probe.status !== 401) {
    const text = await probe.text();
    throw new Error(`monero-rpc unexpected ${probe.status}: ${text.slice(0, 200)}`);
  }
  await probe.body?.cancel();

  if (!user || !pass) {
    throw new Error('monero-rpc returned 401 but no MONERO_RPC_USER/PASS configured');
  }

  const challengeHdr =
    probe.headers.get('www-authenticate') || probe.headers.get('WWW-Authenticate');
  if (!challengeHdr) throw new Error('no WWW-Authenticate header on 401');
  const c = parseChallenge(challengeHdr);

  const cnonce = randomHex(8);
  const nc = '00000001';
  const ha1 = await md5Hex(`${user}:${c.realm}:${pass}`);
  const ha2 = await md5Hex(`POST:${path}`);
  const response = await md5Hex(`${ha1}:${c.nonce}:${nc}:${cnonce}:${c.qop || 'auth'}:${ha2}`);

  const authHeader =
    `Digest username="${user}", realm="${c.realm}", nonce="${c.nonce}", ` +
    `uri="${path}", qop=${c.qop || 'auth'}, nc=${nc}, cnonce="${cnonce}", ` +
    `response="${response}"` +
    (c.opaque ? `, opaque="${c.opaque}"` : '') +
    (c.algorithm ? `, algorithm=${c.algorithm}` : '');

  const res = await fetch(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body,
      client: client(),
    } as RequestInit & { client: Deno.HttpClient },
  );
  if (res.status !== 200) {
    const text = await res.text();
    throw new Error(`monero-rpc auth failed ${res.status}: ${text.slice(0, 200)}`);
  }
  const parsed = (await res.json()) as JsonRpcResponse<T>;
  if (parsed.error) throw new Error(`rpc error ${parsed.error.code}: ${parsed.error.message}`);
  return parsed.result as T;
}

export interface CreateAddressResult {
  address: string;
  address_index: number;
}

/**
 * Generate a fresh subaddress on the configured account.
 *
 * @param label - Short label stored alongside the subaddress in the wallet
 *                cache (visible only to the wallet holder, not on chain).
 */
export async function createSubaddress(label: string): Promise<CreateAddressResult> {
  const account_index = Number(Deno.env.get('MONERO_ACCOUNT_INDEX') || '0');
  return await rpc<CreateAddressResult>({
    method: 'create_address',
    params: { account_index, label },
  });
}
