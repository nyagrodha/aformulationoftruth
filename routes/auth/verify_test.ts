/**
 * GET /auth/verify is the only thing that turns a magic-link URL into a session.
 *
 * The early exits — missing tokens, a bad JWT, a resume token that does not
 * hash to the JWT's session_id — must fire before the database is touched,
 * and they must not echo the email or the tokens back at the client. A
 * mismatch that still issued cookies would let anyone mint a questionnaire
 * session from a stolen or guessed fragment.
 *
 * Hermetic: JWT_SECRET and RESUME_TOKEN_SECRET are set; DATABASE_URL is
 * unparseable so a path that reached getSessionById would throw 500 instead
 * of rendering the expected errorCode.
 *
 *   deno test --allow-env --allow-read routes/auth/verify_test.ts
 */

import { assert, assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { createQuestionnaireJWT } from '../../lib/jwt.ts';
import { generateResumeToken, hashResumeToken } from '../../lib/crypto.ts';

const originalEnv = Deno.env.toObject();
const TEST_ENV_KEYS = ['JWT_SECRET', 'RESUME_TOKEN_SECRET', 'DATABASE_URL'] as const;

function setupTestEnv() {
  Deno.env.set('JWT_SECRET', 'verify-test-jwt-secret');
  Deno.env.set('RESUME_TOKEN_SECRET', 'verify-test-resume-secret');
  Deno.env.set('DATABASE_URL', '::://not-a-database');
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    Deno.env.set(key, value);
  }
  for (const key of TEST_ENV_KEYS) {
    if (!(key in originalEnv)) Deno.env.delete(key);
  }
}

interface Rendered {
  success: boolean;
  error?: string;
  errorCode?: string;
}

function mockCtx() {
  let rendered: Rendered | null = null;
  return {
    get rendered() {
      return rendered;
    },
    ctx: {
      render(data: Rendered) {
        rendered = data;
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  };
}

async function loadHandler() {
  const { handler } = await import('./verify.tsx');
  return handler.GET!;
}

function verifyUrl(params: Record<string, string>): Request {
  const url = new URL('http://localhost/auth/verify');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url);
}

Deno.test({
  name: 'verify: missing token or resume renders MISSING_TOKENS and sets no cookie',
  async fn() {
    setupTestEnv();
    try {
      const get = await loadHandler();
      const cases: Record<string, string>[] = [{}, { token: 'only-jwt' }, { resume: 'only-resume' }];
      for (const params of cases) {
        const mock = mockCtx();
        const response = await get(verifyUrl(params), mock.ctx as never);
        await response.body?.cancel();
        assertEquals(mock.rendered?.errorCode, 'MISSING_TOKENS');
        assertEquals(response.headers.get('set-cookie'), null);
        assertEquals(response.status, 200);
      }
    } finally {
      restoreEnv();
    }
  },
});

Deno.test({
  name: 'verify: a garbage JWT renders INVALID_JWT and never reaches the database',
  async fn() {
    setupTestEnv();
    try {
      const get = await loadHandler();
      const mock = mockCtx();
      const response = await get(
        verifyUrl({ token: 'not-a-jwt', resume: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
        mock.ctx as never,
      );
      await response.body?.cancel();
      // 500 would mean getSessionById ran against the unparseable DATABASE_URL.
      assertEquals(response.status, 200);
      assertEquals(mock.rendered?.errorCode, 'INVALID_JWT');
      assertEquals(response.headers.get('set-cookie'), null);
    } finally {
      restoreEnv();
    }
  },
});

Deno.test({
  name: 'verify: a resume token that does not hash to the JWT session is TOKEN_MISMATCH',
  async fn() {
    setupTestEnv();
    try {
      const jwt = await createQuestionnaireJWT('email-hash-never-an-address', 'session-id-from-jwt');
      const resume = generateResumeToken();
      // The resume token hashes to something else; that is the whole point.
      assert((await hashResumeToken(resume)) !== 'session-id-from-jwt');

      const get = await loadHandler();
      const mock = mockCtx();
      const response = await get(verifyUrl({ token: jwt, resume }), mock.ctx as never);
      await response.body?.cancel();

      assertEquals(response.status, 200, 'mismatch is decided before the database');
      assertEquals(mock.rendered?.errorCode, 'TOKEN_MISMATCH');
      assertEquals(response.headers.get('set-cookie'), null);
    } finally {
      restoreEnv();
    }
  },
});

Deno.test({
  name: 'verify: failure pages do not echo the email, the JWT, or the resume token',
  async fn() {
    setupTestEnv();
    try {
      const jwt = await createQuestionnaireJWT('abc@example.com', 'session-id-from-jwt');
      const get = await loadHandler();
      const mock = mockCtx();
      const response = await get(verifyUrl({ token: jwt, resume: 'visible-resume-token' }), mock.ctx as never);
      const body = await response.text();

      assertEquals(mock.rendered?.errorCode, 'TOKEN_MISMATCH');
      assert(!body.includes('abc@example.com'), 'an address in the JWT must not be rendered');
      assert(!body.includes(jwt), 'the JWT must not be echoed');
      assert(!body.includes('visible-resume-token'), 'the resume token must not be echoed');
      assertStringIncludes(mock.rendered?.error ?? '', 'do not match');
    } finally {
      restoreEnv();
    }
  },
});
