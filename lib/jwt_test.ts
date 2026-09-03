/**
 * Questionnaire JWT contract.
 *
 * The token is the capability that lets a respondent resume: it carries an
 * email hash (never the address) and a session id, and it is the only thing
 * /auth/verify will accept. A verification that ignores expiry, a payload that
 * smuggles the address, or a secret captured before .env is loaded, are all
 * ways this silently stops being authentication.
 *
 *   deno test --allow-env lib/jwt_test.ts
 */

import { assert, assertEquals, assertRejects } from '$std/assert/mod.ts';
import { createQuestionnaireJWT, decodeJWTPayload, isJWTExpired, verifyQuestionnaireJWT } from './jwt.ts';

const SECRET = 'test-jwt-secret-key-for-coverage';
const OTHER = 'other-jwt-secret-key-for-coverage';
const originalSecret = Deno.env.get('JWT_SECRET');

function withSecret<T>(value: string | null, fn: () => T | Promise<T>): Promise<T> {
  if (value === null) Deno.env.delete('JWT_SECRET');
  else Deno.env.set('JWT_SECRET', value);
  return Promise.resolve(fn()).finally(() => {
    if (originalSecret === undefined) Deno.env.delete('JWT_SECRET');
    else Deno.env.set('JWT_SECRET', originalSecret);
  }) as Promise<T>;
}

const HASH = 'a'.repeat(64);
const SESSION = 'b'.repeat(64);

Deno.test('create/verify round-trip returns the hash and session, never an address', async () => {
  await withSecret(SECRET, async () => {
    const token = await createQuestionnaireJWT(HASH, SESSION);
    const payload = await verifyQuestionnaireJWT(token);
    assert(payload !== null);
    assertEquals(payload.email_hash, HASH);
    assertEquals(payload.session_id, SESSION);
    assert(!token.includes('@'), 'the compact token must not carry an address');
    assertEquals(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email_hash), false);
  });
});

Deno.test('a tampered payload fails verification', async () => {
  await withSecret(SECRET, async () => {
    const token = await createQuestionnaireJWT(HASH, SESSION);
    const [h, p, s] = token.split('.');
    // Flip one character of the payload without resigning.
    const flipped = p[0] === 'A' ? 'B' + p.slice(1) : 'A' + p.slice(1);
    const tampered = `${h}.${flipped}.${s}`;
    assertEquals(await verifyQuestionnaireJWT(tampered), null);
  });
});

Deno.test('a token signed with a different secret fails verification', async () => {
  const token = await withSecret(SECRET, () => createQuestionnaireJWT(HASH, SESSION));
  await withSecret(OTHER, async () => {
    assertEquals(await verifyQuestionnaireJWT(token), null);
  });
});

Deno.test('an expired token fails verification', async () => {
  await withSecret(SECRET, async () => {
    // Build an otherwise-valid JWT whose exp is in the past, using the same
    // HS256 construction the production signer uses.
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const b64url = (input: string | ArrayBuffer) => {
      const bytes = typeof input === 'string' ? encoder.encode(input) : new Uint8Array(input);
      return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    };
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
      email_hash: HASH,
      session_id: SESSION,
      iat: 1,
      exp: 2, // 1970
    }));
    const sig = b64url(await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`)));
    const token = `${header}.${payload}.${sig}`;

    assertEquals(isJWTExpired(token), true);
    assertEquals(await verifyQuestionnaireJWT(token), null);
  });
});

Deno.test('malformed tokens fail closed', async () => {
  await withSecret(SECRET, async () => {
    for (const token of ['', 'not-a-jwt', 'a.b', 'a.b.c.d']) {
      assertEquals(await verifyQuestionnaireJWT(token), null, `accepted: ${token}`);
    }
  });
});

Deno.test('decodeJWTPayload does not authenticate — a garbage signature still decodes', async () => {
  await withSecret(SECRET, async () => {
    const token = await createQuestionnaireJWT(HASH, SESSION);
    const [h, p] = token.split('.');
    const decoded = decodeJWTPayload(`${h}.${p}.not-a-signature`);
    assert(decoded !== null, 'decode is unsigned on purpose; verify is what authenticates');
    assertEquals(decoded.email_hash, HASH);
    assertEquals(await verifyQuestionnaireJWT(`${h}.${p}.not-a-signature`), null);
  });
});

Deno.test('signing without JWT_SECRET throws rather than minting an unkeyed token', async () => {
  await withSecret(
    null,
    () => assertRejects(() => createQuestionnaireJWT(HASH, SESSION), Error, 'JWT_SECRET not configured'),
  );
});

Deno.test('the secret is read on each call, not captured at import', async () => {
  // lib/jwt.ts used to read JWT_SECRET at module eval, which is before main.ts
  // loads .env, so every verify threw "not configured" at request time.
  await withSecret(null, async () => {
    // Import already happened at the top of this file with whatever the
    // process had. Setting the secret now must still be enough.
    Deno.env.set('JWT_SECRET', SECRET);
    const token = await createQuestionnaireJWT(HASH, SESSION);
    assertEquals((await verifyQuestionnaireJWT(token))?.session_id, SESSION);
  });
});
