/**
 * The contract these tests pin:
 *
 *   sendEmail is a total function. For every input and every transport
 *   behaviour it RESOLVES to an EmailResult. It never rejects, it never takes
 *   the process with it, and nothing it returns contains the recipient.
 *
 * That sentence was false on 2026-09-01, and no test in this repo could have
 * said so -- lib/email.ts had none at all. The failure was not that mail
 * stopped working; it was that a mail failure killed the server. So these
 * tests are about the shape of failure, not about delivery.
 *
 * Every case injects a MailTransport. Nothing here spawns a process, opens a
 * socket, or writes a file, because CI runs `deno test` with only
 * --allow-env --allow-read --allow-net.
 */
import { assert, assertEquals } from '$std/assert/mod.ts';
import { type MailTransport, sendEmail } from './email.ts';

const RECIPIENT = 'someone@example.com';

const OPTIONS = {
  to: RECIPIENT,
  subject: 'test',
  text: 'plain',
  html: '<p>rich</p>',
};

/**
 * SMTP_* must be present or sendEmail short-circuits on "not configured".
 *
 * `await fn()`, not `return fn()`: sendEmail reads the environment
 * synchronously at its top, so a non-async wrapper restores the variables at
 * the callback's first await and every later send in the same test silently
 * takes the not-configured path instead of the one being asserted.
 */
async function withSmtpEnv(fn: () => Promise<void>): Promise<void> {
  const keys = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'FROM_EMAIL', 'EMAIL_TRANSPORT'];
  const saved = new Map(keys.map((k) => [k, Deno.env.get(k)]));
  Deno.env.set('SMTP_HOST', 'smtp.invalid');
  Deno.env.set('SMTP_USER', 'user@example.com');
  Deno.env.set('SMTP_PASS', 'unused');
  Deno.env.set('FROM_EMAIL', 'from@example.com');
  // The stub hook returns success before any transport runs, which would make
  // every assertion below vacuous.
  Deno.env.delete('EMAIL_TRANSPORT');
  try {
    await fn();
  } finally {
    for (const [k, v] of saved) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
  }
}

Deno.test('sendEmail resolves rather than rejecting when the transport throws', async () => {
  await withSmtpEnv(async () => {
    const throwsSync: MailTransport = () => {
      throw new Error('transport could not start');
    };
    const rejects: MailTransport = () => Promise.reject(new Error('transport died'));
    // Not every rejection carries an Error. smtpFailureKind has an 'Unknown'
    // branch precisely for this, and it should not be the branch that throws.
    const rejectsNonError: MailTransport = () => Promise.reject('boom');

    for (const transport of [throwsSync, rejects, rejectsNonError]) {
      const result = await sendEmail(OPTIONS, transport);
      assertEquals(result.success, false);
      assert(typeof result.error === 'string');
    }
  });
});

Deno.test('sendEmail survives a transport that leaks an orphan rejection', async () => {
  // This is the 2026-09-01 crash, reduced. denomailer created a promise nobody
  // held and let it reject; no lexical try/catch can reach that, so the only
  // thing standing between it and exit(1) is a global handler. Registering one
  // here rather than importing main.ts keeps the test off the server's boot
  // path while still proving that sendEmail itself stays on its feet.
  await withSmtpEnv(async () => {
    const escaped: unknown[] = [];
    const guard = (event: Event) => {
      escaped.push((event as PromiseRejectionEvent).reason);
      event.preventDefault();
    };
    globalThis.addEventListener('unhandledrejection', guard);

    try {
      const orphaning: MailTransport = () => {
        Promise.reject(new Error('invalid cmd')); // nobody holds this
        return Promise.resolve({ ok: false, kind: 'BadResource' });
      };

      const result = await sendEmail(OPTIONS, orphaning);
      // Rejections are delivered on a later turn than the send that spawned
      // them; without this the assertion races the event.
      await new Promise((r) => setTimeout(r, 250));

      assertEquals(result.success, false);
      // Three attempts, three orphans. If this is 0 the reduction no longer
      // reproduces the shape it is meant to guard.
      assertEquals(escaped.length, 3);
    } finally {
      globalThis.removeEventListener('unhandledrejection', guard);
    }
  });
});

Deno.test('sendEmail retries transport faults but not permanent rejections', async () => {
  await withSmtpEnv(async () => {
    let calls = 0;
    const transient: MailTransport = () => {
      calls++;
      return Promise.resolve({ ok: false, kind: 'TimedOut' }); // no code
    };
    await sendEmail(OPTIONS, transient);
    assertEquals(calls, 3, 'a codeless transport fault should exhaust MAX_ATTEMPTS');

    calls = 0;
    const refused: MailTransport = () => {
      calls++;
      return Promise.resolve({ ok: false, kind: 'SMTPResponseException', code: 550 });
    };
    const result = await sendEmail(OPTIONS, refused);
    assertEquals(calls, 1, 'a 5xx will fail identically every time; do not retry it');
    assertEquals(result.statusCode, 550);

    calls = 0;
    const throttled: MailTransport = () => {
      calls++;
      return Promise.resolve({ ok: false, kind: 'SMTPResponseException', code: 421 });
    };
    await sendEmail(OPTIONS, throttled);
    assertEquals(calls, 3, "Apple's 4xx means try later, so try later");
  });
});

Deno.test('sendEmail reports success on the first transport that accepts', async () => {
  await withSmtpEnv(async () => {
    let calls = 0;
    const ok: MailTransport = () => {
      calls++;
      return Promise.resolve({ ok: true, kind: 'None' });
    };
    const result = await sendEmail(OPTIONS, ok);
    assertEquals(result, { success: true, statusCode: 250 });
    assertEquals(calls, 1);
  });
});

Deno.test('sendEmail passes both a text and an html part to the transport', async () => {
  // multipart/alternative regression: the key box's sender is set_content-only,
  // and a web-tier copy that dropped add_alternative would silently deliver
  // plaintext to everyone. The transport is where that becomes observable.
  await withSmtpEnv(async () => {
    let seen: { text: string; html: string; from_name: string } | undefined;
    const capture: MailTransport = (spec) => {
      seen = spec;
      return Promise.resolve({ ok: true, kind: 'None' });
    };
    await sendEmail(OPTIONS, capture);
    assertEquals(seen?.text, 'plain');
    assertEquals(seen?.html, '<p>rich</p>');
    assert(seen!.from_name.length > 0, 'a blank display name reads as spam');
  });
});

Deno.test('a failed send never returns the recipient', async () => {
  // EmailResult.error used to be error.message, and one of the two branches in
  // denomailer's assertCode threw `${cmd.code}: ${cmd.args}` -- where args on a
  // rejected RCPT TO is the address itself. All three callers happen to check
  // only .success, so it was never printed, but it crossed this boundary.
  await withSmtpEnv(async () => {
    const leaky: MailTransport = () => Promise.resolve({ ok: false, kind: `550: ${RECIPIENT}`, code: 550 });
    const result = await sendEmail(OPTIONS, leaky);
    assert(!JSON.stringify(result).includes(RECIPIENT), 'recipient escaped in EmailResult');
    assert(!JSON.stringify(result).includes('example.com'), 'recipient domain escaped');
  });
});

Deno.test('sendEmail reports a configuration failure without calling the transport', async () => {
  const saved = Deno.env.get('SMTP_HOST');
  const savedStub = Deno.env.get('EMAIL_TRANSPORT');
  Deno.env.delete('SMTP_HOST');
  Deno.env.delete('EMAIL_TRANSPORT');
  try {
    let called = false;
    const never: MailTransport = () => {
      called = true;
      return Promise.resolve({ ok: true, kind: 'None' });
    };
    const result = await sendEmail(OPTIONS, never);
    assertEquals(result.success, false);
    assertEquals(called, false);
  } finally {
    if (saved !== undefined) Deno.env.set('SMTP_HOST', saved);
    if (savedStub !== undefined) Deno.env.set('EMAIL_TRANSPORT', savedStub);
  }
});

Deno.test('EMAIL_TRANSPORT=stub short-circuits before the transport', async () => {
  // routes/api/gate-submit_test.ts:55 and routes/api/auth/magic-link_test.ts:29
  // both depend on this; it must survive any change of transport.
  const saved = Deno.env.get('EMAIL_TRANSPORT');
  Deno.env.set('EMAIL_TRANSPORT', 'stub');
  try {
    let called = false;
    const never: MailTransport = () => {
      called = true;
      return Promise.resolve({ ok: false, kind: 'None' });
    };
    const result = await sendEmail(OPTIONS, never);
    assertEquals(result.success, true);
    assertEquals(called, false);
  } finally {
    saved === undefined ? Deno.env.delete('EMAIL_TRANSPORT') : Deno.env.set('EMAIL_TRANSPORT', saved);
  }
});
