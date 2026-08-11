/**
 * Recipient selection for questionnaire answers.
 *
 * Run with: deno task test
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { recipientsForSession } from '../routes/api/questions/answer.ts';

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
