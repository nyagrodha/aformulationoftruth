/**
 * POST /api/gate is the other door answers enter through.
 *
 * The landing form posts /api/gate-submit. The /gate page posts here, one
 * question at a time. Both must fail closed: if the Rust gate cannot encrypt,
 * this process must refuse rather than persist plaintext. These tests pin that
 * contract the same way gate-submit_test.ts does.
 *
 * Hermetic: fetch is stubbed, and DATABASE_URL is unparseable so the first
 * DB touch throws. 503 is the encryption-failure branch, which returns
 * *before* the INSERT. A path that reached the database would surface as 500.
 *
 *   deno test --allow-net --allow-read --allow-env routes/api/gate_test.ts
 */

import { assert, assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { GATE_QUESTIONS } from '../../lib/gate_encrypt.ts';

interface GateCall {
  url: string;
  headers: Headers;
  session_id: string;
  question_index: number;
  question_text: string;
  answer: string;
  skipped: boolean;
}

const originalFetch = globalThis.fetch;
const originalEnv = Deno.env.toObject();
const TEST_ENV_KEYS = ['DATABASE_URL', 'GATE_API_KEY'] as const;

function setupTestEnv() {
  // Unparseable on purpose: resolveConfig() returns null, getPool() throws.
  // A real PGHOST in the environment must not be picked up as a fallback.
  Deno.env.set('DATABASE_URL', '::://not-a-database');
  Deno.env.delete('GATE_API_KEY');
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    Deno.env.set(key, value);
  }
  for (const key of TEST_ENV_KEYS) {
    if (!(key in originalEnv)) Deno.env.delete(key);
  }
}

function stubGate(respond: (callIndex: number) => Response | null = () => new Response(null, { status: 200 })) {
  const calls: GateCall[] = [];

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = input instanceof Request ? input.headers : new Headers(init?.headers);
    const raw = input instanceof Request ? await input.text() : String(init?.body ?? '');
    const body = JSON.parse(raw);
    calls.push({ url, headers, ...body });

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

async function loadHandler() {
  const { handler } = await import('./gate.ts');
  return handler.POST!;
}

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/gate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID = {
  gateToken: 'gate_11111111222233334444555555555555',
  questionIndex: 0,
  answer: 'a hammock and no appointments',
  skipped: false,
};

// ---------------------------------------------------------------------------
// Input validation — nothing reaches the gate until the body is well formed
// ---------------------------------------------------------------------------

Deno.test({
  name: 'gate: rejects unparseable JSON without calling the gate',
  async fn() {
    setupTestEnv();
    const gate = stubGate();
    try {
      const post = await loadHandler();
      const req = new Request('http://localhost/api/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json{',
      });
      const response = await post(req, {} as never);

      assertEquals(response.status, 400);
      assertEquals((await response.json()).error, 'Invalid JSON');
      assertEquals(gate.calls.length, 0);
    } finally {
      gate.restore();
      restoreEnv();
    }
  },
});

Deno.test({
  name: 'gate: rejects a missing token or out-of-range index without calling the gate',
  async fn() {
    setupTestEnv();
    const gate = stubGate();
    try {
      const post = await loadHandler();
      const bad = [
        { questionIndex: 0, answer: 'x', skipped: false },
        { gateToken: '', questionIndex: 0, answer: 'x', skipped: false },
        { ...VALID, questionIndex: 2 },
        { ...VALID, questionIndex: -1 },
        { ...VALID, skipped: 'yes' },
      ];
      for (const body of bad) {
        const response = await post(jsonRequest(body), {} as never);
        assertEquals(response.status, 400, `should reject ${JSON.stringify(body)}`);
        await response.body?.cancel();
      }
      assertEquals(gate.calls.length, 0, 'no answer text should leave for an invalid submission');
    } finally {
      gate.restore();
      restoreEnv();
    }
  },
});

// ---------------------------------------------------------------------------
// Fail-closed: a gate that cannot encrypt must abort before any write
// ---------------------------------------------------------------------------

Deno.test({
  name: 'gate: refuses when the gate is unreachable, and the error carries no answer',
  async fn() {
    setupTestEnv();
    const gate = stubGate(() => null);
    try {
      const post = await loadHandler();
      const response = await post(jsonRequest(VALID), {} as never);
      const body = await response.json();

      assertEquals(response.status, 503, '503 is the encryption-failure branch, before the INSERT');
      assertStringIncludes(body.error, 'securely store');
      assert(!JSON.stringify(body).includes(VALID.answer), 'answer must not reach the client');
      assertEquals(gate.calls.length, 1);
    } finally {
      gate.restore();
      restoreEnv();
    }
  },
});

Deno.test({
  name: 'gate: refuses when the gate rejects the store',
  async fn() {
    setupTestEnv();
    const CANARY = 'plaintext-echo-from-gate';
    const gate = stubGate(() => new Response(CANARY, { status: 500 }));
    try {
      const post = await loadHandler();
      const response = await post(jsonRequest({ ...VALID, answer: CANARY }), {} as never);
      const body = await response.json();

      assertEquals(response.status, 503);
      assert(!JSON.stringify(body).includes(CANARY), 'gate response body must not reach the client');
    } finally {
      gate.restore();
      restoreEnv();
    }
  },
});

// ---------------------------------------------------------------------------
// The encryption contract: the answer goes to the gate, with no key header
// ---------------------------------------------------------------------------

Deno.test({
  name: 'gate: a well-formed answer is posted to /api/store without X-Gate-Key',
  async fn() {
    setupTestEnv();
    Deno.env.set('GATE_API_KEY', 'should-not-be-sent');
    const gate = stubGate();
    try {
      const post = await loadHandler();
      const response = await post(jsonRequest(VALID), {} as never);

      // Encryption succeeded; the unconfigured database is what fails next.
      assert(response.status !== 503, 'encryption step should have succeeded');
      await response.body?.cancel();

      assertEquals(gate.calls.length, 1);
      const call = gate.calls[0];
      assertStringIncludes(call.url, '/api/store');
      assertEquals(call.headers.get('X-Gate-Key'), null);
      assertEquals(call.session_id, VALID.gateToken);
      assertEquals(call.question_index, 0);
      assertEquals(call.question_text, GATE_QUESTIONS[0]);
      assertEquals(call.answer, VALID.answer);
      assertEquals(call.skipped, false);
    } finally {
      gate.restore();
      restoreEnv();
    }
  },
});

Deno.test({
  name: 'gate: a skipped answer is still routed through the gate as empty text',
  async fn() {
    setupTestEnv();
    const gate = stubGate();
    try {
      const post = await loadHandler();
      const response = await post(
        jsonRequest({
          gateToken: VALID.gateToken,
          questionIndex: 1,
          answer: 'should-be-dropped',
          skipped: true,
        }),
        {} as never,
      );
      await response.body?.cancel();

      assertEquals(gate.calls.length, 1);
      assertEquals(gate.calls[0].question_index, 1);
      assertEquals(gate.calls[0].question_text, GATE_QUESTIONS[1]);
      assertEquals(gate.calls[0].skipped, true);
      assertEquals(gate.calls[0].answer, '');
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
  name: 'gate: the fresh_gate_responses INSERT binds NULL for both answer columns',
  async fn() {
    const source = await Deno.readTextFile(new URL('./gate.ts', import.meta.url));
    const insert = source.match(/INSERT INTO fresh_gate_responses[\s\S]*?VALUES\s*\([^)]*\)/);

    assert(insert, 'expected an INSERT INTO fresh_gate_responses in the handler');
    assertStringIncludes(insert[0], 'q0_answer');
    assertStringIncludes(insert[0], 'q1_answer');
    assertStringIncludes(insert[0], 'VALUES ($1, NULL, NULL)');
    assertEquals(insert[0].match(/\$\d+/g)?.length, 1, 'only the gate token may be bound');
  },
});

Deno.test({
  name: 'the /gate page posts here, not a third client',
  async fn() {
    const source = await Deno.readTextFile(new URL('../gate.tsx', import.meta.url));
    assert(source.includes("new URL('/api/gate', req.url)"), '/gate must post to this fail-closed endpoint');
    assert(!source.includes('gate-client'), 'the retired client must not come back');
    assert(!source.includes('storeEncryptedAnswer'), '/gate must go through the HTTP handler, not a private import');
  },
});
