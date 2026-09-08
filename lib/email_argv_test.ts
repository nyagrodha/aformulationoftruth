/**
 * Web-tier mailer argv and environment contract.
 *
 * lib/email_test.ts already pins parseSenderOutcome and "a failed send returns".
 * These pin the other half of d59fe0e: nothing sensitive on argv, and the mail
 * subprocess must not inherit DATABASE_URL or the JWT secret.
 *
 * Source-only so they run in CI without python3 or a live SMTP.
 *
 *   deno test --allow-read lib/email_argv_test.ts
 */

import { assert, assertEquals } from '$std/assert/mod.ts';

const src = await Deno.readTextFile(new URL('./email.ts', import.meta.url));

Deno.test('runSender argv is only the sender and the spec path', () => {
  assert(
    src.includes('args: [SENDER, `${dir}/mail.json`]'),
    'python3 must be invoked with the sender and the spec path, nothing else',
  );
});

Deno.test('the recipient and body go in the spec file, not on argv', () => {
  const command = src.slice(src.indexOf('new Deno.Command'));
  const argsBlock = command.slice(command.indexOf('args:'), command.indexOf(']'));
  assertEquals(argsBlock.includes('spec.to'), false, 'the address must not appear in argv');
  assertEquals(argsBlock.includes('options.to'), false, 'the address must not appear in argv');
  assertEquals(argsBlock.includes('spec.text'), false, 'the body must not appear in argv');
  assert(
    src.includes('JSON.stringify(spec)'),
    'the recipient must still be written into the spec file',
  );
});

Deno.test('the mail subprocess does not inherit DATABASE_URL or JWT_SECRET', () => {
  const command = src.slice(src.indexOf('new Deno.Command'));
  assert(command.includes('clearEnv: true'), 'the child environment must start empty');
  assert(
    command.includes("PATH: '/usr/bin:/bin'"),
    'PATH is restored so python3 can be found; nothing else should leak in',
  );
  assertEquals(
    command.includes('DATABASE_URL'),
    false,
    'the database URL must not be forwarded to the mailer',
  );
  assertEquals(
    command.includes('JWT_SECRET'),
    false,
    'the JWT secret must not be forwarded to the mailer',
  );
});

Deno.test('mailer stderr is discarded so an SMTP traceback cannot echo the envelope', () => {
  const command = src.slice(src.indexOf('new Deno.Command'));
  assert(command.includes("stderr: 'null'"));
});

Deno.test('a permanent 5xx is not retried', () => {
  // A fabricated 5xx would suppress the retry a transient fault needs; a real
  // 5xx retried three times hammers Apple identically. Pin the split.
  assert(
    src.includes('outcome.code === undefined || outcome.code < 500'),
    'only transport faults and 4xx are worth retrying',
  );
  assert(src.includes('const MAX_ATTEMPTS = 3'));
});

Deno.test('the spec file is 0600 and removed in finally', () => {
  assert(src.includes("{ mode: 0o600 }"));
  assert(src.includes('await Deno.remove(dir, { recursive: true })'));
});
