/**
 * Delivery mailer argv contract.
 *
 * /proc/<pid>/cmdline is world-readable, so the recipient, the body and the
 * PDF path must never appear as arguments. They belong in a 0600 spec file
 * whose path is the only argument besides the sender itself.
 *
 *   deno test --allow-read romania/tests/mailer_argv_test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const src = await Deno.readTextFile(new URL('../mailer.ts', import.meta.url));

Deno.test('sendDelivery argv is only the sender and the spec path', () => {
  assert(
    src.includes('args: [SENDER, specPath]'),
    'python3 must be invoked with the sender and the spec path, nothing else',
  );
});

Deno.test('the recipient goes in the spec file, not on argv', () => {
  const command = src.slice(src.indexOf('new Deno.Command'));
  const argsBlock = command.slice(command.indexOf('args:'), command.indexOf(']'));
  assertEquals(argsBlock.includes('mail.to'), false, 'the address must not appear in argv');
  assertEquals(argsBlock.includes('body('), false, 'the body must not appear in argv');
  assert(
    src.includes('to: mail.to'),
    'the address must still be written into the spec file',
  );
});
