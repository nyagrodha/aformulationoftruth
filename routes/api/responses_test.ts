/**
 * POST /api/responses is the older answers door. It still accepts an email
 * and a map of answers; a malformed body must die before the INSERT, and
 * the email must never come back in the error.
 *
 * DATABASE_URL is unparseable so a well-formed body cannot reach Postgres.
 *
 *   deno test --allow-env --allow-read --allow-net routes/api/responses_test.ts
 */

import { assert, assertEquals } from '$std/assert/mod.ts';
import { handler } from './responses.ts';

const POST = handler.POST!;
const CANARY = 'canary-respondent@example.invalid';

const originalEnv = Deno.env.toObject();

function setupDbGone() {
  Deno.env.set('DATABASE_URL', '::://not-a-database');
  Deno.env.delete('PGHOST');
  Deno.env.delete('PGDATABASE');
  Deno.env.delete('PGUSER');
  Deno.env.delete('PGPASSWORD');
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    Deno.env.set(key, value);
  }
  for (const key of ['DATABASE_URL', 'PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']) {
    if (!(key in originalEnv)) Deno.env.delete(key);
  }
}

async function post(body: BodyInit, contentType = 'application/json'): Promise<Response> {
  return await POST(
    new Request('http://localhost/api/responses', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    }),
    // deno-lint-ignore no-explicit-any
    {} as any,
  );
}

Deno.test({
  name: 'responses: unparseable JSON is 400 and does not echo the body',
  async fn() {
    setupDbGone();
    try {
      const res = await post(`{"email":"${CANARY}",`);
      assertEquals(res.status, 400);
      const text = await res.text();
      assertEquals(JSON.parse(text).error, 'Invalid JSON body');
      assert(!text.includes(CANARY), 'the address must not come back');
    } finally {
      restoreEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: 'responses: a missing or malformed email is 400 without echoing it',
  async fn() {
    setupDbGone();
    try {
      for (const body of [{ answers: {} }, { email: 'not-an-email', answers: {} }, { email: CANARY }]) {
        const res = await post(JSON.stringify(body));
        assertEquals(res.status, 400, JSON.stringify(body));
        const text = await res.text();
        assertEquals(JSON.parse(text).error, 'Invalid request format');
        assert(!text.includes(CANARY), 'the address must not come back');
      }
    } finally {
      restoreEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: 'responses: a well-formed body against a dead store is 500 without the email',
  async fn() {
    setupDbGone();
    try {
      const res = await post(JSON.stringify({
        email: CANARY,
        answers: { '0': 'an intimate answer' },
      }));
      assertEquals(res.status, 500);
      const text = await res.text();
      assertEquals(JSON.parse(text).error, 'Submission failed');
      assert(!text.includes(CANARY), 'the address must not reach the client');
      assert(!text.includes('intimate'), 'the answer must not reach the client');
    } finally {
      restoreEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
