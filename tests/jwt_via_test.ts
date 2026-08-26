/**
 * The `via` claim on questionnaire JWTs.
 *
 * `via` records how the holder proved they may use the session: 'link' means
 * they clicked something delivered to the address, 'gate' means they only typed
 * the address into the gate form. /api/responses/deliver refuses 'gate',
 * because mailing a copy on the strength of a typed address turns the site into
 * a way to send unsolicited post to a stranger.
 *
 * The load-bearing case here is the third one. When the claim was added there
 * were 2,768 links outstanding whose tokens carry no `via` at all, and every
 * one of them came from an emailed link. If a missing claim ever stopped
 * reading as 'link', all of those people would be refused their own copy.
 *
 * No database, no network, no mail.
 *
 * Run with: deno task test tests/jwt_via_test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { createQuestionnaireJWT, decodeJWTPayload, verifyQuestionnaireJWT } from '../lib/jwt.ts';

// jwt.ts reads JWT_SECRET lazily on every call, so a value set here is seen by
// every signing and verification path. Restored on unload so a suite run in the
// same process as anything else does not inherit the test secret.
const PRIOR_JWT_ENV = Deno.env.get('JWT_SECRET');
if (PRIOR_JWT_ENV === undefined) {
  // Random per run rather than a literal: a fixed string in the repository is
  // indistinguishable from a leaked credential to any scanner, including this
  // project's own pre-commit hook, and the tests only need SOME consistent
  // secret for the process.
  Deno.env.set('JWT_SECRET', crypto.randomUUID());
}
addEventListener('unload', () => {
  if (PRIOR_JWT_ENV === undefined) {
    Deno.env.delete('JWT_SECRET');
  } else {
    Deno.env.set('JWT_SECRET', PRIOR_JWT_ENV);
  }
});

// Stand-ins with the shape of the real values and none of the meaning: the
// email hash is a SHA-256-width hex string that hashes nothing, the session id
// a UUID that names no session.
const EMAIL_HASH = 'a'.repeat(64);
const SESSION_ID = '00000000-0000-4000-8000-000000000000';

const encoder = new TextEncoder();

function base64urlEncode(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : new Uint8Array(input);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Mint a token by hand, the way the pre-`via` code did: same header, same
 * HMAC-SHA256 over `${headerB64}.${payloadB64}`, same secret, and whatever
 * payload the caller hands over.
 */
async function signByHand(payload: Record<string, unknown>): Promise<string> {
  const secret = Deno.env.get('JWT_SECRET');
  assert(secret, 'JWT_SECRET must be set for this suite');

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const headerB64 = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${headerB64}.${payloadB64}`));

  return `${headerB64}.${payloadB64}.${base64urlEncode(signature)}`;
}

function basePayload(): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    email_hash: EMAIL_HASH,
    session_id: SESSION_ID,
    iat: now,
    exp: now + 24 * 60 * 60,
  };
}

Deno.test({
  name: 'createQuestionnaireJWT - omitting `via` mints a link token',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const token = await createQuestionnaireJWT(EMAIL_HASH, SESSION_ID);
    const payload = await verifyQuestionnaireJWT(token);

    assert(payload, 'a freshly minted token must verify');
    assertEquals(payload.via, 'link');
    assertEquals(payload.email_hash, EMAIL_HASH);
    assertEquals(payload.session_id, SESSION_ID);

    // The claim has to be written onto the wire, not merely inferred by
    // verify()'s default. decodeJWTPayload does no normalising, so it sees
    // exactly what createQuestionnaireJWT put there and nothing else.
    const onTheWire = decodeJWTPayload(token);
    assert(onTheWire, 'a freshly minted token must decode');
    assertEquals(onTheWire.via, 'link');
  },
});

Deno.test({
  name: 'createQuestionnaireJWT - `gate` survives the round trip',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const token = await createQuestionnaireJWT(EMAIL_HASH, SESSION_ID, 'gate');
    const payload = await verifyQuestionnaireJWT(token);

    assert(payload, 'a gate token must verify');
    // If this ever came back 'link', anyone who typed a stranger's address into
    // the gate could have a copy posted to them.
    assertEquals(payload.via, 'gate');
  },
});

Deno.test({
  name: 'verifyQuestionnaireJWT - a token minted before the claim existed reads as link',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const payload = basePayload();
    assertEquals('via' in payload, false, 'this fixture must carry no via claim at all');

    const token = await signByHand(payload);
    const verified = await verifyQuestionnaireJWT(token);

    assert(verified, 'a correctly signed legacy token must still verify');
    assertEquals(verified.via, 'link', 'the 2,768 outstanding links must keep working');
  },
});

Deno.test({
  name: 'verifyQuestionnaireJWT - a nonsense via value normalises to link',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const token = await signByHand({ ...basePayload(), via: 'sideways' });
    const verified = await verifyQuestionnaireJWT(token);

    assert(verified, 'a correctly signed token must verify whatever via says');
    assertEquals(verified.via, 'link');
  },
});

Deno.test({
  name: 'verifyQuestionnaireJWT - a tampered signature returns null',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const token = await createQuestionnaireJWT(EMAIL_HASH, SESSION_ID, 'gate');
    const [headerB64, payloadB64, signatureB64] = token.split('.');

    // One character of the signature, swapped for another in the same alphabet
    // so the token still parses and still decodes -- only the bytes differ.
    const first = signatureB64[0];
    const tampered = `${headerB64}.${payloadB64}.${first === 'A' ? 'B' : 'A'}${signatureB64.slice(1)}`;
    assert(tampered !== token, 'the tamper must actually change the token');

    assertEquals(await verifyQuestionnaireJWT(tampered), null);
  },
});
