/**
 * Gate Submission Encryption Tests
 *
 * POST /api/gate-submit is the one place a visitor's gate answers enter the
 * system. CLAUDE.md ("User Input Encryption") requires that the answer text is
 * age-encrypted by the Rust gate and that no plaintext answer is ever persisted
 * — and that the endpoint FAILS CLOSED, refusing the whole submission rather
 * than falling back to storing anything in the clear.
 *
 * These tests pin that contract. They are hermetic: `fetch` is stubbed to stand
 * in for the gate, and DATABASE_URL is deliberately left unparseable so that
 * `resolveConfig()` returns null and the first DB touch throws immediately. No
 * Postgres, no gate service, and no socket is opened.
 *
 * That unconfigured DB is also the load-bearing trick for the fail-closed
 * tests: the handler answers 503 only on the encryption-failure branch, which
 * returns *before* the INSERT. Any code path that reached the database would
 * surface as 500 instead. So `status === 503` is positive evidence that nothing
 * was written.
 *
 *   deno test --allow-net --allow-read --allow-env routes/api/gate-submit_test.ts
 */

import { assert, assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { GATE_QUESTIONS } from '../../lib/gate_encrypt.ts';

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
const TEST_ENV_KEYS = ['DATABASE_URL', 'JWT_SECRET', 'RESUME_TOKEN_SECRET', 'BASE_URL', 'DENO_ENV'] as const;

function setupTestEnv() {
  /*
   * Unparseable on purpose: `new URL()` throws inside resolveConfig(), which
   * returns null, so getPool() throws on the first DB touch. This keeps the
   * suite off Postgres *and* makes 503-vs-500 meaningful. It must be set (not
   * merely absent) so a real PGHOST/PGDATABASE in the developer's environment
   * cannot be picked up as a fallback.
   */
  Deno.env.set('DATABASE_URL', '::://not-a-database');
  Deno.env.set('JWT_SECRET', 'test-jwt-secret-key');
  Deno.env.set('RESUME_TOKEN_SECRET', 'test-secret-key-for-hmac-operations');
  Deno.env.set('BASE_URL', 'http://localhost:8000');
  Deno.env.set('DENO_ENV', 'test');
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
// The encryption contract: every answer goes to the gate, and goes there first
// ---------------------------------------------------------------------------

Deno.test({
  name: 'gate-submit: sends both answers to the gate for age-encryption before any write',
  async fn() {
    setupTestEnv();
    const gate = stubGate();
    try {
      const post = await loadHandler();
      const response = await post(
        jsonRequest({
          email: 'visitor@example.com',
          answer1: '  a hammock and no appointments  ',
          answer2: 'being understood exactly',
        }),
        {} as never,
      );

      /*
       * The gate step succeeded, so the handler moved on to the (unconfigured)
       * database and failed there. 503 is reserved for encryption failure — the
       * point is that we are past it, not that the request as a whole succeeded.
       */
      assert(response.status !== 503, 'encryption step should have succeeded');
      await response.body?.cancel();

      assertEquals(gate.calls.length, 2, 'both gate questions must be encrypted');

      const [q0, q1] = gate.calls;
      assertStringIncludes(q0.url, '/api/store');
      assertStringIncludes(q1.url, '/api/store');

      assertEquals(q0.question_index, 0);
      assertEquals(q1.question_index, 1);
      assertEquals(q0.question_text, GATE_QUESTIONS[0]);
      assertEquals(q1.question_text, GATE_QUESTIONS[1]);

      // Answers are trimmed but otherwise verbatim — the gate, not this app,
      // is what turns them into ciphertext.
      assertEquals(q0.answer, 'a hammock and no appointments');
      assertEquals(q1.answer, 'being understood exactly');
      assertEquals(q0.skipped, false);
      assertEquals(q1.skipped, false);

      // One opaque session token ties the pair together, and it is not the email.
      assertEquals(q0.session_id, q1.session_id);
      assert(!q0.session_id.includes('@'), 'the gate session id must not carry the address');
    } finally {
      gate.restore();
      restoreEnv();
    }
  },
});

Deno.test({
  name: 'gate-submit: an empty answer is still routed through the gate, marked skipped',
  async fn() {
    setupTestEnv();
    const gate = stubGate();
    try {
      const post = await loadHandler();
      const response = await post(
        jsonRequest({ email: 'visitor@example.com', answer1: '', answer2: '   ' }),
        {} as never,
      );
      await response.body?.cancel();

      assertEquals(gate.calls.length, 2);
      assertEquals(gate.calls[0].skipped, true);
      assertEquals(gate.calls[1].skipped, true);
      assertEquals(gate.calls[0].answer, '');
      assertEquals(gate.calls[1].answer, '');
    } finally {
      gate.restore();
      restoreEnv();
    }
  },
});

// ---------------------------------------------------------------------------
// Fail-closed: a gate that cannot encrypt must abort the submission
// ---------------------------------------------------------------------------

Deno.test({
  name: 'gate-submit: refuses the submission when the gate rejects an answer',
  async fn() {
    setupTestEnv();
    // Question 0 encrypts; question 1 is refused.
    const gate = stubGate((i) => new Response(null, { status: i === 1 ? 500 : 200 }));
    try {
      const post = await loadHandler();
      const response = await post(
        jsonRequest({ email: 'visitor@example.com', answer1: 'one', answer2: 'two' }),
        {} as never,
      );

      assertEquals(response.status, 503, '503 is the encryption-failure branch, which returns before the INSERT');
      assertStringIncludes((await response.json()).error, 'securely store');
    } finally {
      gate.restore();
      restoreEnv();
    }
  },
});

Deno.test({
  name: 'gate-submit: refuses the submission when the gate is unreachable',
  async fn() {
    setupTestEnv();
    const gate = stubGate(() => null); // fetch rejects, as with a down gate
    try {
      const post = await loadHandler();
      const response = await post(
        jsonRequest({ email: 'visitor@example.com', answer1: 'one', answer2: 'two' }),
        {} as never,
      );

      assertEquals(response.status, 503);
      await response.body?.cancel();
      assertEquals(gate.calls.length, 1, 'the second answer must not be attempted after the first fails');
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
    const gate = stubGate(() => null);
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
    assertStringIncludes(insert[0], 'VALUES ($1, NULL, NULL)');

    // $1 is the gate token and the only bound parameter — no answer, no email.
    assertEquals(insert[0].match(/\$\d+/g)?.length, 1, 'only the gate token may be bound');
  },
});
