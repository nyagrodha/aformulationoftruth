/**
 * Mailer contract tests.
 *
 * These pin the two properties that broke the site for three days in August
 * 2026, when denomailer 1.6.0 failed every submission to Apple and leaked a
 * rejected promise that Deno turned into exit(1) — 251 crashes in 24 hours,
 * each one a respondent who submitted the gate and never got a link.
 *
 *   1. A failed send must be REPORTED, not fatal. The failure path returns a
 *      value; it does not throw, and it does not leave a rejection behind.
 *   2. The failure summary must carry a reply code and a class name and
 *      NOTHING ELSE. Zero-logging (CLAUDE.md) has no exception for a stack
 *      trace, and smtplib's exceptions carry the envelope.
 *
 * Hermetic: SMTP_HOST points at a closed port on loopback, so the only network
 * call attempted is refused immediately. No mail is sent.
 *
 *   deno test --allow-run --allow-read --allow-write --allow-env lib/email_test.ts
 */

import { assert, assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { fromFileUrl } from '$std/path/mod.ts';
import { parseSenderOutcome, sendEmail } from './email.ts';

const SENDER = fromFileUrl(new URL('./send_mail.py', import.meta.url));

/** An address that must never appear in anything the sender prints. */
const CANARY = 'canary-recipient@example.invalid';

Deno.test('parseSenderOutcome reads a coded failure', () => {
  assertEquals(parseSenderOutcome('code=535 kind=SMTPAuthenticationError'), {
    code: 535,
    kind: 'SMTPAuthenticationError',
  });
});

Deno.test('parseSenderOutcome reads a codeless transport failure', () => {
  assertEquals(parseSenderOutcome('code=none kind=ConnectionRefusedError'), {
    code: undefined,
    kind: 'ConnectionRefusedError',
  });
});

Deno.test('parseSenderOutcome invents no code from unexpected output', () => {
  // A fabricated 5xx would suppress the retry a transient fault needs, so
  // anything off-contract must yield no code at all.
  for (const noise of ['', 'Traceback (most recent call last):', '550 sorry', 'code=x kind=y']) {
    const outcome = parseSenderOutcome(noise);
    assertEquals(outcome.code, undefined, `invented a code from: ${noise}`);
    assertEquals(outcome.kind, 'Unknown');
  }
});

Deno.test('send_mail.py reports failure on one PII-free line', async () => {
  const dir = await Deno.makeTempDir({ prefix: 'a4t-mail-test-' });
  try {
    const spec = `${dir}/mail.json`;
    await Deno.writeTextFile(
      spec,
      JSON.stringify({
        to: CANARY,
        from: `test <${CANARY}>`,
        subject: 'contract test',
        text: 'body',
        html: '<p>body</p>',
      }),
      { mode: 0o600 },
    );

    const result = await new Deno.Command('python3', {
      args: [SENDER, spec],
      clearEnv: true,
      env: {
        PATH: '/usr/bin:/bin',
        // Port 1 on loopback: refused before any SMTP dialogue begins.
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: '1',
        SMTP_USER: 'nobody',
        SMTP_PASS: 'nothing',
      },
      stdout: 'piped',
      stderr: 'piped',
    }).output();

    const stdout = new TextDecoder().decode(result.stdout);
    const stderr = new TextDecoder().decode(result.stderr);

    assert(!result.success, 'a refused connection must exit non-zero');
    assert(
      /^code=(none|[2-5]\d{2}) kind=\w+$/.test(stdout.trim()),
      `off-contract stdout: ${JSON.stringify(stdout)}`,
    );
    // The whole point: no traceback, no envelope, on either stream.
    assertEquals(stderr, '', 'the sender printed to stderr');
    assert(!stdout.includes(CANARY), 'the recipient reached stdout');
    assert(!stdout.includes('Traceback'), 'a traceback reached stdout');

    assertEquals(parseSenderOutcome(stdout).code, undefined);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test('a failed send returns rather than throwing', async () => {
  const saved = Deno.env.toObject();
  const set = (k: string, v: string) => Deno.env.set(k, v);
  set('SMTP_HOST', '127.0.0.1');
  set('SMTP_PORT', '1');
  set('SMTP_SECURE', 'false');
  set('SMTP_USER', 'nobody');
  set('SMTP_PASS', 'nothing');
  set('FROM_EMAIL', CANARY);

  // Three attempts against a refused port, with the production backoff.
  const result = await sendEmail({
    to: CANARY,
    subject: 'contract test',
    text: 'body',
    html: '<p>body</p>',
  });

  try {
    assertEquals(result.success, false);
    assertEquals(result.statusCode, undefined, 'a transport failure has no reply code');
    // Callers put this in HTTP responses; it must be a fixed string.
    assertStringIncludes(result.error ?? '', 'SMTP send failed');
    assert(!(result.error ?? '').includes(CANARY), 'the recipient reached the caller');
  } finally {
    for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'FROM_EMAIL']) {
      const original = saved[k];
      if (original === undefined) Deno.env.delete(k);
      else Deno.env.set(k, original);
    }
  }
});
