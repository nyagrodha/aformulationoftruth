/**
 * Questionnaire answer recipients, and the auth gates that must fail before
 * any answer text leaves the process.
 *
 * recipientsForSession lived in tests/answer_recipients_test.ts; CI cannot
 * run that directory.
 *
 *   deno test --allow-env --allow-read routes/api/questions/answer_test.ts
 */

import { assert, assertEquals } from '$std/assert/mod.ts';
import { handler, recipientsForSession } from './answer.ts';

const breakglass = () => 'age1breakglass';

Deno.test('recipientsForSession - pairs the stored pubkey with break-glass', () => {
  assertEquals(recipientsForSession('age1session', breakglass), ['age1session', 'age1breakglass']);
});

// A NULL pubkey is a pre-existing session, not an error. Every questionnaire in
// flight when this deploys has one, and throwing would break those people
// mid-run at whichever question they happened to be on.
Deno.test('recipientsForSession - a legacy session falls back to the gate default', () => {
  assertEquals(recipientsForSession(null, breakglass), []);
});

Deno.test('recipientsForSession - never returns break-glass alone', () => {
  // Encrypting to break-glass only would produce a row the respondent could
  // never receive and only an offline ceremony could open.
  assertEquals(recipientsForSession(null, breakglass).includes('age1breakglass'), false);
});

// The break-glass recipient is read from the environment and THROWS when it is
// unset. Taking it as a thunk keeps that throw on the path that actually needs
// the key: a legacy session must not fail because of a variable it never uses.
Deno.test('recipientsForSession - does not read break-glass for a legacy session', () => {
  let read = false;
  const recipients = recipientsForSession(null, () => {
    read = true;
    return 'age1breakglass';
  });

  assertEquals(recipients, []);
  assert(!read, 'break-glass must not be consulted when there is no session key');
});

Deno.test('recipientsForSession - propagates a break-glass failure when it IS needed', () => {
  let threw = false;
  try {
    recipientsForSession('age1session', () => {
      throw new Error('BREAKGLASS_AGE_RECIPIENT not configured');
    });
  } catch {
    threw = true;
  }
  // Fail closed: a session key with no break-glass would be unrecoverable the
  // moment that key is shredded, so refusing is correct.
  assert(threw, 'a missing break-glass must not silently degrade to one recipient');
});

function post(headers: Record<string, string>, body?: unknown): Request {
  return new Request('http://localhost/api/questions/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

Deno.test('answer POST - missing Authorization never reaches the gate', async () => {
  const response = await handler.POST!(post({ 'X-Resume-Token': 'opaque' }), {} as never);
  assertEquals(response.status, 401);
  assertEquals((await response.json()).error, 'Missing or invalid Authorization header');
});

Deno.test('answer POST - missing resume token never reaches the gate', async () => {
  const response = await handler.POST!(post({ Authorization: 'Bearer not.a.jwt' }), {} as never);
  assertEquals(response.status, 401);
  assertEquals((await response.json()).error, 'Missing resume token');
});
