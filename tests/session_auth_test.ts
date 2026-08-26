/**
 * One way to answer "who is this request".
 *
 * The case worth pinning is the third one. The resume_token cookie has been set
 * with a thirty-day Max-Age since opaque tokens shipped, and until
 * lib/session-auth.ts existed nothing read it: a JWT older than twenty-four
 * hours meant the questionnaire turned the person away, thirty-day promise or
 * not. A regression there is invisible -- everything still works for anyone who
 * comes back the same day -- so it is the assertion this file exists for.
 *
 * The database-backed tests skip cleanly without DATABASE_URL. They insert one
 * session under a random email hash and delete it again in a finally.
 *
 * Run with: deno test --allow-net --allow-read --allow-write --allow-env tests/session_auth_test.ts
 */

import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';

// Set before the modules under test are imported: lib/jwt.ts and lib/crypto.ts
// read their secrets on demand, but a test that inherited a real secret from
// the environment would be signing with production key material for no reason.
// An existing value is left alone so the suite can also run against a
// configured shell.
// Random per run rather than literals: a fixed credential-shaped string in the
// repository is indistinguishable from a real leaked one to any scanner.
if (!Deno.env.get('JWT_SECRET')) Deno.env.set('JWT_SECRET', crypto.randomUUID());
if (!Deno.env.get('RESUME_TOKEN_SECRET')) Deno.env.set('RESUME_TOKEN_SECRET', crypto.randomUUID());

import { createQuestionnaireJWT, verifyQuestionnaireJWT } from '../lib/jwt.ts';
import { authenticateRequest, getCookie, isAuthenticated, sessionCookieHeaders } from '../lib/session-auth.ts';
import { startOrResumeSession } from '../lib/questionnaire-session.ts';
import { closePool, withConnection } from '../lib/db.ts';

// The guard: no database configured, no database tests. Nothing here needs a
// running HTTP server, and nothing sends mail.
const HAS_DB = !!Deno.env.get('DATABASE_URL');

/** A hash-shaped value that belongs to nobody, so no real row can be touched. */
function randomHash(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
}

function requestWithCookies(cookie?: string): Request {
  return new Request('http://localhost/questionnaire', cookie ? { headers: { Cookie: cookie } } : undefined);
}

async function deleteSessionRow(sessionId: string): Promise<void> {
  await withConnection(async (client) => {
    await client.queryObject(`DELETE FROM fresh_questionnaire_sessions WHERE session_id = $1`, [sessionId]);
  });
}

// ============================================================================
// No credentials at all
// ============================================================================

Deno.test({
  name: 'authenticateRequest - neither cookie is nocookie, not expired',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const result = await authenticateRequest(requestWithCookies());
    assert(!isAuthenticated(result));
    assertEquals(result, { failure: 'nocookie' });
  },
});

Deno.test({
  name: 'authenticateRequest - an unrelated cookie is still nocookie',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // A cold browser that has been to the landing page carries something; the
    // distinction the interstitial copy depends on is "no credential", not "no
    // cookie header".
    const result = await authenticateRequest(requestWithCookies('theme=dark; consent=1'));
    assertEquals(result, { failure: 'nocookie' });
  },
});

// ============================================================================
// The JWT path
// ============================================================================

Deno.test({
  name: 'authenticateRequest - a valid jwt cookie authenticates and keeps its via claim',
  ignore: !HAS_DB,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const created = await startOrResumeSession(randomHash());
    try {
      // 'gate' rather than the default, so the test would fail if `via` were
      // hardcoded on the way out. /api/responses/deliver refuses 'gate', which
      // is the whole reason the claim has to survive the round trip.
      const jwt = await createQuestionnaireJWT(created.emailHash, created.sessionId, 'gate');
      const result = await authenticateRequest(requestWithCookies(`jwt=${jwt}`));

      assert(isAuthenticated(result), 'a valid jwt naming an existing session must authenticate');
      assertEquals(result.session.sessionId, created.sessionId);
      assertEquals(result.via, 'gate');
      assertEquals(result.refreshedJwt, undefined, 'a working jwt must not be reminted');
    } finally {
      await deleteSessionRow(created.sessionId);
    }
  },
});

Deno.test({
  name: 'authenticateRequest - a valid jwt for a deleted session is notfound, not expired',
  ignore: !HAS_DB,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const created = await startOrResumeSession(randomHash());
    try {
      const jwt = await createQuestionnaireJWT(created.emailHash, created.sessionId, 'link');
      await deleteSessionRow(created.sessionId);

      const result = await authenticateRequest(requestWithCookies(`jwt=${jwt}`));
      assertEquals(result, { failure: 'notfound' });
    } finally {
      // The delete above is the point of the test, so this is normally a no-op.
      // It is here for the run where the line before it never happens.
      await deleteSessionRow(created.sessionId);
    }
  },
});

Deno.test({
  name: 'authenticateRequest - a rotated resume_token still finds the session it never renamed',
  ignore: !HAS_DB,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Every other database test here starts a session and uses its first token,
    // and for a brand-new row session_id === resume_token_hash. So none of them
    // can tell `WHERE resume_token_hash = $1` from `WHERE session_id = $1` --
    // the pre-migration-012 lookup passes all of them. Only a token that has
    // been rotated separates the two, which is the case migration 012 exists
    // for: a second gate submission reissues the credential and keeps the row.
    const emailHash = randomHash();
    const first = await startOrResumeSession(emailHash);
    try {
      const second = await startOrResumeSession(emailHash);
      assertEquals(second.reused, true, 'a second submission must reuse the row rather than replace it');
      assertEquals(second.sessionId, first.sessionId);
      assert(second.opaqueToken !== first.opaqueToken, 'the credential has to actually rotate');

      const result = await authenticateRequest(requestWithCookies(`resume_token=${second.opaqueToken}`));
      assert(isAuthenticated(result), 'the reissued token must authenticate');
      assertEquals(result.session.sessionId, first.sessionId, 'and must land on the original row, answers and all');
    } finally {
      await deleteSessionRow(first.sessionId);
    }
  },
});

// ============================================================================
// The resume path -- the thirty days
// ============================================================================

Deno.test({
  name: 'authenticateRequest - a dead jwt plus a live resume_token redeems the thirty days',
  ignore: !HAS_DB,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const created = await startOrResumeSession(randomHash());
    try {
      // What a browser actually presents on day two: the jwt cookie is still
      // there and no longer verifies. A tampered signature stands in for an
      // expired exp -- verifyQuestionnaireJWT returns null for both, and that
      // null is the only thing the resume path keys on.
      //
      // The character corrupted is in the MIDDLE of the signature, never the
      // last one. A 32-byte signature is 43 base64url characters, and the final
      // character's low two bits decode to nothing: about one signature in
      // sixteen ends in 'A', and rewriting that 'A' to a 'B' leaves all 32 bytes
      // identical, so the token would still verify, the JWT branch would answer,
      // and this test would fail one run in sixteen for no reason. Measured at
      // 122/2000. The assertion below refuses to proceed on a live token
      // whatever the arithmetic does.
      const good = await createQuestionnaireJWT(created.emailHash, created.sessionId, 'gate');
      const [header, payload64, signature] = good.split('.');
      const at = Math.floor(signature.length / 2);
      const dead = `${header}.${payload64}.${signature.slice(0, at)}${signature[at] === 'A' ? 'B' : 'A'}${
        signature.slice(at + 1)
      }`;
      assertEquals(
        await verifyQuestionnaireJWT(dead),
        null,
        'the jwt has to be genuinely dead, or the resume path below is never reached',
      );

      const cookie = `jwt=${dead}; resume_token=${created.opaqueToken}`;
      const result = await authenticateRequest(requestWithCookies(cookie));

      assert(isAuthenticated(result), 'the resume token must survive the jwt it outlives');
      assertEquals(result.session.sessionId, created.sessionId);
      // Emailed, therefore proof of the mailbox, therefore 'link' and not 'gate'.
      assertEquals(result.via, 'link');
      assert(typeof result.refreshedJwt === 'string', 'the caller needs a jwt to set');

      const payload = await verifyQuestionnaireJWT(result.refreshedJwt!);
      assert(payload, 'the minted jwt must verify');
      assertEquals(payload!.session_id, created.sessionId);
      assertEquals(payload!.via, 'link');

      // A cookie that is not JWT-shaped at all takes the same fallback: the
      // failure mode is "unreadable", not "malformed" versus "expired".
      const malformed = await authenticateRequest(
        requestWithCookies(`jwt=nonsense; resume_token=${created.opaqueToken}`),
      );
      assert(isAuthenticated(malformed));
      assertEquals(malformed.session.sessionId, created.sessionId);
    } finally {
      await deleteSessionRow(created.sessionId);
    }
  },
});

Deno.test({
  name: 'authenticateRequest - a resume_token alone, with no jwt at all, still works',
  ignore: !HAS_DB,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const created = await startOrResumeSession(randomHash());
    try {
      const result = await authenticateRequest(requestWithCookies(`resume_token=${created.opaqueToken}`));
      assert(isAuthenticated(result));
      assertEquals(result.session.sessionId, created.sessionId);
      assert(typeof result.refreshedJwt === 'string');
    } finally {
      await deleteSessionRow(created.sessionId);
    }
  },
});

Deno.test({
  name: 'authenticateRequest - a resume_token matching nothing is expired',
  ignore: !HAS_DB,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Shaped like a real token and hashing to nothing in the table: a rotated
    // credential, or a session cleaned up after thirty idle days.
    const result = await authenticateRequest(requestWithCookies(`resume_token=${randomHash()}`));
    assertEquals(result, { failure: 'expired' });
  },
});

// ============================================================================
// The cookie pair
// ============================================================================

Deno.test('sessionCookieHeaders - two cookies, each with the lifetime it is meant to have', () => {
  const headers = sessionCookieHeaders('the-jwt', 'the-opaque-token');
  assertEquals(headers.length, 2);

  const jwtCookie = headers.find((h) => h.startsWith('jwt='));
  const resumeCookie = headers.find((h) => h.startsWith('resume_token='));
  assert(jwtCookie, 'a jwt cookie');
  assert(resumeCookie, 'a resume_token cookie');

  // 24 hours against 30 days. If these ever match, the resume path above has
  // nothing left to redeem.
  assertStringIncludes(jwtCookie!, 'Max-Age=86400');
  assertStringIncludes(resumeCookie!, 'Max-Age=2592000');

  for (const cookie of headers) {
    assertStringIncludes(cookie, 'HttpOnly');
    assertStringIncludes(cookie, 'SameSite=Lax');
    assertStringIncludes(cookie, 'Path=/');
  }
});

Deno.test('sessionCookieHeaders - Secure follows the scheme, so http://localhost is not silently broken', () => {
  const before = {
    base: Deno.env.get('BASE_URL'),
    deno: Deno.env.get('DENO_ENV'),
    node: Deno.env.get('NODE_ENV'),
  };
  try {
    // The production flags have to be out of the way: either one forces Secure
    // regardless of scheme, which is correct behaviour and would mask this.
    Deno.env.delete('DENO_ENV');
    Deno.env.delete('NODE_ENV');

    Deno.env.set('BASE_URL', 'http://localhost:8000');
    for (const cookie of sessionCookieHeaders('j', 't')) {
      assert(!cookie.includes('; Secure'), 'a Secure cookie over http is dropped by the browser in silence');
    }

    Deno.env.set('BASE_URL', 'https://aformulationoftruth.com');
    for (const cookie of sessionCookieHeaders('j', 't')) {
      assertStringIncludes(cookie, '; Secure');
    }
  } finally {
    if (before.base === undefined) Deno.env.delete('BASE_URL');
    else Deno.env.set('BASE_URL', before.base);
    if (before.deno === undefined) Deno.env.delete('DENO_ENV');
    else Deno.env.set('DENO_ENV', before.deno);
    if (before.node === undefined) Deno.env.delete('NODE_ENV');
    else Deno.env.set('NODE_ENV', before.node);
  }
});

// ============================================================================
// The parser everything above rests on
// ============================================================================

Deno.test('getCookie - finds a cookie, and returns null rather than a neighbour', () => {
  const header = 'theme=dark; jwt=abc.def.ghi; resume_token=0123abc';
  assertEquals(getCookie(header, 'jwt'), 'abc.def.ghi');
  assertEquals(getCookie(header, 'resume_token'), '0123abc');
  assertEquals(getCookie(header, 'session'), null);
  assertEquals(getCookie(null, 'jwt'), null);
  assertEquals(getCookie('', 'jwt'), null);
});

Deno.test('getCookie - a name that is a suffix of another does not match it', () => {
  // `token=x` must not answer a request for `resume_token`, and the leading
  // boundary in the pattern is the only thing preventing it.
  assertEquals(getCookie('not_jwt=wrong; jwt=right', 'jwt'), 'right');
  assertEquals(getCookie('other_resume_token=wrong', 'resume_token'), null);
});

// The pool holds its connections open for the life of the process. Closing it
// here rather than leaning on sanitizeResources keeps the exit clean.
Deno.test({
  name: 'teardown - close the connection pool',
  ignore: !HAS_DB,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await closePool();
  },
});
