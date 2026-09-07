/**
 * PDF password guards that must run even when typst/qpdf are absent.
 *
 * romania/tests/protect_test.ts skips its empty-password and newline cases
 * whenever the renderer tools are missing, which is every CI machine. Those
 * checks throw before qpdf is invoked, so they can (and must) run here.
 *
 *   deno test --allow-read --allow-write romania/tests/protect_guard_test.ts
 */

import { assert, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { protectPdf } from '../protect.ts';

const dummy = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF" is enough: we never reach qpdf

Deno.test('protectPdf - refuses an empty password rather than emitting plaintext', async () => {
  const dir = await Deno.makeTempDir({ prefix: 'protect-guard-' });
  try {
    await assertRejects(() => protectPdf(dummy, '', dir), Error, 'empty password');
    for (const entry of Deno.readDirSync(dir)) {
      assert(entry.name !== 'plain.pdf', 'the decrypted PDF was left in the working directory');
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

// The @argfile format is one argument per line and has no escaping, so a
// newline in the password injects qpdf arguments. Moving the password off argv
// to fix an information leak is what created this vector; these pin it shut.
for (const [name, pw] of [['LF', 'a\n--decrypt'], ['CR', 'a\r--decrypt'], ['CRLF', 'a\r\n--decrypt']] as const) {
  Deno.test(`protectPdf - refuses a password containing ${name}`, async () => {
    const dir = await Deno.makeTempDir({ prefix: 'protect-guard-' });
    try {
      await assertRejects(() => protectPdf(dummy, pw, dir), Error, 'line separator');
      for (const entry of Deno.readDirSync(dir)) {
        assert(entry.name !== 'plain.pdf', 'the decrypted PDF was left in the working directory');
        assert(!entry.name.startsWith('qpdf.'), 'an argument file was left behind');
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  });
}
