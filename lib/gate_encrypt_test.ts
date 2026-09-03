/**
 * The one gate client.
 *
 * Q0–Q1 and Q2–Q34 used to take different modules to the same Rust service.
 * The questionnaire client required GATE_API_KEY and stuffed the response
 * body into Error — a header the gate never reads, and a leak of whatever
 * the gate said about the answer. These tests pin the surviving contract:
 * one function, fail closed, no body, no key.
 *
 *   deno test --allow-net --allow-read --allow-env lib/gate_encrypt_test.ts
 */

import { assert, assertEquals, assertRejects } from '$std/assert/mod.ts';
import { GateUnavailableError, storeEncryptedAnswer } from './gate_encrypt.ts';

const originalFetch = globalThis.fetch;

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

Deno.test({
  name: 'storeEncryptedAnswer - does not require GATE_API_KEY',
  async fn() {
    const prev = Deno.env.get('GATE_API_KEY');
    Deno.env.delete('GATE_API_KEY');
    globalThis.fetch = () => Promise.resolve(new Response(null, { status: 200 }));
    try {
      await storeEncryptedAnswer({
        sessionId: '11111111-2222-3333-4444-555555555555',
        questionIndex: 2,
        questionText: 'What is the trait you most deplore in yourself?',
        answer: 'a private answer',
        skipped: false,
      });
    } finally {
      restoreFetch();
      if (prev === undefined) Deno.env.delete('GATE_API_KEY');
      else Deno.env.set('GATE_API_KEY', prev);
    }
  },
});

Deno.test({
  name: 'storeEncryptedAnswer - does not send X-Gate-Key',
  async fn() {
    let headers: Headers | undefined;
    globalThis.fetch = (input, init) => {
      headers = input instanceof Request ? input.headers : new Headers(init?.headers);
      return Promise.resolve(new Response(null, { status: 200 }));
    };
    try {
      Deno.env.set('GATE_API_KEY', 'should-not-be-sent');
      await storeEncryptedAnswer({
        sessionId: '11111111-2222-3333-4444-555555555555',
        questionIndex: 3,
        questionText: 'q',
        answer: 'a',
      });
      assert(headers, 'the gate must have been called');
      assertEquals(headers.get('X-Gate-Key'), null);
    } finally {
      restoreFetch();
      Deno.env.delete('GATE_API_KEY');
    }
  },
});

Deno.test({
  name: 'storeEncryptedAnswer - unreachable gate is GateUnavailableError, not a raw fetch error',
  async fn() {
    globalThis.fetch = () => Promise.reject(new TypeError('error sending request for https://example.invalid/leak'));
    try {
      const err = await assertRejects(
        () =>
          storeEncryptedAnswer({
            sessionId: '11111111-2222-3333-4444-555555555555',
            questionIndex: 4,
            questionText: 'q',
            answer: 'intimate',
          }),
        GateUnavailableError,
      );
      assert(!err.message.includes('intimate'), 'answer must not appear in the error');
      assert(!err.message.includes('example.invalid'), 'fetch detail must not appear in the error');
    } finally {
      restoreFetch();
    }
  },
});

Deno.test({
  name: 'storeEncryptedAnswer - a rejected store drains the body and does not put it on the error',
  async fn() {
    const CANARY = 'plaintext-answer-echo';
    globalThis.fetch = () => Promise.resolve(new Response(CANARY, { status: 500 }));
    try {
      const err = await assertRejects(
        () =>
          storeEncryptedAnswer({
            sessionId: '11111111-2222-3333-4444-555555555555',
            questionIndex: 5,
            questionText: 'q',
            answer: CANARY,
          }),
        GateUnavailableError,
      );
      assert(!err.message.includes(CANARY), 'response body must not reach the Error');
      assertEquals(err.message, 'Gate encryption unavailable: status 500');
    } finally {
      restoreFetch();
    }
  },
});

Deno.test('questionnaire answers import the fail-closed client, not the retired one', async () => {
  const source = await Deno.readTextFile(new URL('../routes/api/questions/answer.ts', import.meta.url));
  assert(
    source.includes("from '../../../lib/gate_encrypt.ts'"),
    'Q2–Q34 must use the same client as the gate',
  );
  assert(!source.includes('gate-client'), 'the retired client must not be imported');
  assert(source.includes('status: 503'), 'a failed store must refuse, not advance the session');
});
