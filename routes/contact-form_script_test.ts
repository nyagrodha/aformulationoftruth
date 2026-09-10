/**
 * Contact-form client: PGP fail-closed, and no raw error objects.
 *
 * 2fe1e72 stopped passing the caught error to console.error — a rejected fetch
 * or an openpgp failure both quote their input, which is the message the user
 * just typed. The PGP path must also refuse to POST plaintext when encryption
 * fails: a silent downgrade would defeat the checkbox they ticked.
 *
 * Modelled on routes/messenger_test.tsx, which pins the messenger's
 * "no server plaintext" claim the same way.
 *
 *   deno test --allow-read routes/contact-form_script_test.ts
 */

import { assert, assertEquals } from '$std/assert/mod.ts';

const src = await Deno.readTextFile(new URL('../public/js/contact-form.js', import.meta.url));

Deno.test('PGP failure does not fall back to posting plaintext', () => {
  const pgpCatch = src.slice(src.indexOf('payload = pgpEncrypted ? await pgpEncrypt(raw) : raw'));
  const catchBlock = pgpCatch.slice(pgpCatch.indexOf('catch {'), pgpCatch.indexOf('let response'));
  assert(catchBlock.includes('return;'), 'PGP failure must return before fetch');
  assert(
    catchBlock.includes('nothing was sent'),
    'the user must be told the message did not leave',
  );
});

Deno.test('console.error is a category string; the caught error is never logged', () => {
  for (const line of src.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.includes('console.error')) continue;
    assert(
      /console\.error\('\[contact-form\] [^']+'\);?$/.test(trimmed),
      `raw error objects can carry the message body, found: ${trimmed}`,
    );
  }
});

Deno.test('the PGP path still posts to /api/contact with pgpEncrypted true', () => {
  assert(src.includes("fetch('/api/contact'"));
  assert(src.includes('pgpEncrypted'));
  assertEquals(src.includes('pgpEncrypt(raw) : raw'), true);
});
