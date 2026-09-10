/**
 * Gate Submission fail-closed tests.
 *
 * POST /api/gate-submit is the one place a visitor's gate answers enter the
 * system. The route now provisions a per-session key BEFORE any answer is
 * handed to the gate: an unset break-glass recipient or an unreachable key
 * box must refuse the whole submission, and no answer text may leave the
 * process on that path.
 *
 * Hermetic: `fetch` is stubbed, DATABASE_URL is unparseable, the key box is
 * not configured. No Postgres, no ssh, no gate service.
 *
 *   deno test --allow-net --allow-read --allow-env routes/api/gate-submit_test.ts
 */

import { assert, assertEquals, assertStringIncludes } from '$std/assert/mod.ts';

/** One intercepted call to the gate, decoded. */
interface GateCall {
  url: string;
  session_id: string;
  question_index: number;
  question_text: string;
  answer: string;
  skipped: boolean;
}

const originalFetch = globalThis.fetch;
const originalEnv = Deno.env.toObject();
const TEST_ENV_KEYS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'RESUME_TOKEN_SECRET',
  'BASE_URL',
  'DENO_ENV',
  'BREAKGLASS_AGE_RECIPIENT',
] as const;

function setupTestEnv() {
  /*
   * Unparseable on purpose: `new URL()` throws inside resolveConfig(), which
   * returns null, so getPool() throws on the first DB touch. This keeps the
   * suite off Postgres. It must be set (not merely absent) so a real
   * PGHOST/PGDATABASE in the developer's environment cannot be picked up.
   */
  Deno.env.set('DATABASE_URL', '::://not-a-database');
  Deno.env.set('JWT_SECRET', 'test-jwt-secret-key');
  Deno.env.set('RESUME_TOKEN_SECRET', 'test-secret-key-for-hmac-operations');
  Deno.env.set('BASE_URL', 'http://localhost:8000');
  Deno.env.set('DENO_ENV', 'test');
  Deno.env.delete('BREAKGLASS_AGE_RECIPIENT');
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    Deno.env.set(key, value);
  }
  for (const key of TEST_ENV_KEYS) {
    if (!(key in originalEnv)) Deno.env.delete(key);
  }
}

/**
 * Replace `fetch` with a recorder standing in for the Rust gate.
 *
 * `respond` decides what the gate does for each call in sequence, so a test can
 * let question 0 encrypt and then have question 1 fail. Returning null makes
 * the call reject, standing in for an unreachable gate.
 */
function stubGate(respond: (callIndex: number) => Response | null = () => new Response(null, { status: 200 })) {
  const calls: GateCall[] = [];

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const raw = input instanceof Request ? await input.text() : String(init?.body ?? '');
    const body = JSON.parse(raw);
    calls.push({ url, ...body });

    const result = respond(calls.length - 1);
    if (result === null) throw new TypeError('error sending request');
    return result;
  };

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

/** Load the handler fresh-ish; module caching means env must be set first. */
async function loadHandler() {
  const { handler } = await import('./gate-submit.ts');
  return handler.POST!;
}

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/gate-submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function formRequest(fields: Record<string, string>): Request {
  const form = new URLSearchParams(fields);
  return new Request('http://localhost/api/gate-submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
}

// ---------------------------------------------------------------------------
// Input validation — nothing reaches the gate until the submission is well formed
// ---------------------------------------------------------------------------

Deno.test({
  name: 'gate-submit: rejects a missing email without calling the gate',
  async fn() {
    setupTestEnv();
    const gate = stubGate();
    try {
      const post = await loadHandler();
      const response = await post(jsonRequest({ answer1: 'a', answer2: 'b' }), {} as never);

      assertEquals(response.status, 400);
      assertEquals((await response.json()).error, 'Valid email required');
      assertEquals(gate.calls.length, 0, 'no answer text should leave the process for an invalid submission');
    } finally {
      gate.restore();
      restoreEnv();
    }
  },
});

Deno.test({
  name: 'gate-submit: rejects an unparseable body without calling the gate',
  async fn() {
    setupTestEnv();
    const gate = stubGate();
    try {
      const post = await loadHandler();
      const req = new Request('http://localhost/api/gate-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json{',
      });
      const response = await post(req, {} as never);

      assertEquals(response.status, 400);
      assertEquals((await response.json()).error, 'Invalid request body');
      assertEquals(gate.calls.length, 0);
    } finally {
      gate.restore();
      restoreEnv();
    }
  },
});

// ---------------------------------------------------------------------------
// Fail-closed: a session whose identity cannot be provisioned must abort
// before any answer text leaves the process.
// ---------------------------------------------------------------------------

Deno.test({
  name: 'gate-submit: refuses the submission when BREAKGLASS_AGE_RECIPIENT is unset',
  async fn() {
    setupTestEnv();
    const gate = stubGate();
    try {
      const post = await loadHandler();
      const response = await post(
        jsonRequest({
          email: 'visitor@example.com',
          answer1: 'a hammock and no appointments',
          answer2: 'being understood exactly',
        }),
        {} as never,
      );

      assertEquals(response.status, 503);
      const body = await response.json();
      assertStringIncludes(body.error, 'securely store');
      assert(!JSON.stringify(body).includes('hammock'), 'the refusal must not echo answer text');
      assert(!JSON.stringify(body).includes('visitor@'), 'the refusal must not echo the address');
      assertEquals(gate.calls.length, 0, 'no answer text should leave the process when provisioning fails');
    } finally {
      gate.restore();
      restoreEnv();
    }
  },
});

Deno.test({
  name: 'gate-submit: the no-JS form path fails closed too, and leaks nothing in the redirect',
  async fn() {
    setupTestEnv();
    const gate = stubGate();
    try {
      const post = await loadHandler();
      const response = await post(
        formRequest({ email: 'visitor@example.com', answer1: 'one', answer2: 'two' }),
        {} as never,
      );
      await response.body?.cancel();

      assertEquals(response.status, 303);
      const location = response.headers.get('Location') ?? '';
      assertEquals(location, '/?error=server#begin');

      // Zero-logging policy: the bounce URL carries a category, never the input.
      assert(!location.includes('@'), 'redirect must not carry the address');
      assert(!location.includes('one'), 'redirect must not carry answer text');
      assertEquals(gate.calls.length, 0);
    } finally {
      gate.restore();
      restoreEnv();
    }
  },
});

// ---------------------------------------------------------------------------
// Schema guardrail: the row that *is* written carries no answer text
// ---------------------------------------------------------------------------

Deno.test({
  name: 'gate-submit: the fresh_gate_responses INSERT binds NULL for both answer columns',
  async fn() {
    /*
     * A static read rather than a live INSERT: the plaintext columns exist only
     * as a tombstone of the pre-gate schema, and the invariant worth pinning is
     * the shape of the statement itself. A live test would need Postgres and
     * would still only observe what this assertion reads directly.
     */
    const source = await Deno.readTextFile(new URL('./gate-submit.ts', import.meta.url));
    const insert = source.match(/INSERT INTO fresh_gate_responses[\s\S]*?VALUES\s*\([^)]*\)/);

    assert(insert, 'expected an INSERT INTO fresh_gate_responses in the handler');
    assertStringIncludes(insert[0], 'q0_answer');
    assertStringIncludes(insert[0], 'q1_answer');
    // Answers stay NULL. $2/$3 are the session pubkey and the encrypted address.
    assertStringIncludes(insert[0], 'VALUES ($1, NULL, NULL, $2, $3)');
    assertEquals(insert[0].match(/\$\d+/g)?.length, 3, 'token, pubkey, encrypted address — never an answer');
  },
});
