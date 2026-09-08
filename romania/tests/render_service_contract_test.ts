/**
 * Render-service contracts that must hold before anything is decrypted.
 *
 * validateBundle is already covered in service_test.ts. These pin the two
 * neighbouring fail-closed rules: skipped answers are never handed to age
 * (an empty ciphertext would fail the whole render), and a delivery failure
 * returns a fixed string, never the exception message.
 *
 *   deno test --allow-read romania/tests/render_service_contract_test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const src = await Deno.readTextFile(new URL('../render-service.ts', import.meta.url));

Deno.test('skipped or empty-ciphertext answers are never decrypted', () => {
  assert(
    src.includes("a.skipped || a.ciphertext === '' ? '' : await decryptWith(identity, a.ciphertext)"),
    'handing an empty ciphertext to age would fail a render over a question the respondent never reached',
  );
});

Deno.test('a failed delivery returns a fixed body and logs only the exception class', () => {
  const fail = src.slice(src.indexOf("console.error('[render] delivery failed"));
  const logLine = fail.slice(0, fail.indexOf('\n'));
  assert(
    logLine.includes('exc instanceof Error ? exc.name : typeof exc'),
    'the exception MESSAGE can carry answer text or the address',
  );
  assert(src.includes("return new Response('render failed', { status: 500 })"));
  assertEquals(
    src.includes('exc.message'),
    false,
    'the exception message must never reach a log or a response',
  );
});

Deno.test('the HTTP handler refuses to start without RENDER_TOKEN and checks Bearer', () => {
  assert(src.includes("if (!TOKEN)"));
  assert(src.includes("req.headers.get('Authorization') !== `Bearer ${TOKEN}`"));
  assert(src.includes("return new Response('unauthorized', { status: 401 })"));
});

Deno.test('notifyDelivered checks res.ok so a 404 cannot hide', () => {
  // 464aaaf: for months every confirmation 404'd and nothing said so, so the
  // shred clock never started. The status is not PII; not checking it is how
  // that hid. Other coverage PRs export notifyDelivered; this pins the source
  // on production as it exists today.
  const notify = src.slice(src.indexOf('async function notifyDelivered'));
  assert(notify.includes('if (!res.ok)'));
  assert(notify.includes('res.status'));
});
