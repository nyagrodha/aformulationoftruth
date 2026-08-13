/**
 * PDF password protection.
 *
 * Needs `typst` (to produce something to protect) and `qpdf`. Skips loudly when
 * absent rather than failing, so a laptop or CI without the tools does not go
 * red -- but never skips silently, because an absent test and a passing one
 * must not look alike.
 *
 * Verified against qpdf 11.9.0 and 12.2.0: both accept the 11.7+
 * `--user-password=` form and report R = 6, the PDF 2.0 AES-256 handler.
 */

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { renderPdf } from '../render.ts';
import { protectPdf } from '../protect.ts';

/**
 * Is this binary present?
 *
 * Deliberately does NOT judge by exit status. pdftotext takes -v rather than
 * --version and exits non-zero for the latter, so a --version probe reported it
 * missing and silently skipped the Tamil-shaping test -- the most important one
 * here -- while the suite still read green. Presence is what we are asking, so
 * "did it spawn at all" is the right question.
 */
async function have(bin: string): Promise<boolean> {
  try {
    await new Deno.Command(bin, { args: ['--version'], stdout: 'null', stderr: 'null' }).output();
    return true;
  } catch {
    return false; // NotFound
  }
}

const READY = (await have('typst')) && (await have('qpdf'));
if (!READY) console.warn('[protect_test] typst or qpdf absent - protection tests SKIPPED');

const doc = {
  entries: [{
    index: 0,
    tamilNumeral: '௧',
    tamil: 'கேள்வி',
    transliteration: 'kēḷvi',
    english: 'What is your idea of perfect happiness?',
    answer: 'A quiet room.',
    skipped: false,
  }],
};

/** Can qpdf open it with this password (or none, when null)? */
async function opens(pdf: Uint8Array, password: string | null): Promise<boolean> {
  const dir = await Deno.makeTempDir({ prefix: 'opens-' });
  try {
    const p = `${dir}/in.pdf`;
    await Deno.writeFile(p, pdf, { mode: 0o600 });
    const args = password === null ? ['--check', p] : [`--password=${password}`, '--check', p];
    const argPath = `${dir}/args`;
    await Deno.writeTextFile(argPath, args.join('\n'), { mode: 0o600 });
    const res = await new Deno.Command('qpdf', { args: [`@${argPath}`], stdout: 'null', stderr: 'null' }).output();
    return res.success;
  } finally {
    await Deno.remove(dir, { recursive: true }).catch(() => {});
  }
}

Deno.test({
  name: 'protectPdf - the encrypted PDF opens with the password',
  ignore: !READY,
  async fn() {
    const dir = await Deno.makeTempDir({ prefix: 'protect-' });
    const pdf = await protectPdf(await renderPdf(doc, dir), 'correct horse battery', dir);
    assert(await opens(pdf, 'correct horse battery'));
    await Deno.remove(dir, { recursive: true });
  },
});

Deno.test({
  name: 'protectPdf - and does NOT open without it',
  ignore: !READY,
  async fn() {
    const dir = await Deno.makeTempDir({ prefix: 'protect-' });
    const pdf = await protectPdf(await renderPdf(doc, dir), 'correct horse battery', dir);
    // The whole point: Apple's servers and the respondent's mailbox hold
    // ciphertext, not a readable document.
    assertEquals(await opens(pdf, null), false, 'a passwordless open must fail');
    await Deno.remove(dir, { recursive: true });
  },
});

Deno.test({
  name: 'protectPdf - refuses an empty password rather than emitting plaintext',
  ignore: !READY,
  async fn() {
    const dir = await Deno.makeTempDir({ prefix: 'protect-' });
    const plain = await renderPdf(doc, dir);
    await assertRejects(() => protectPdf(plain, '', dir), Error, 'empty password');
    await Deno.remove(dir, { recursive: true });
  },
});

// The @argfile format is one argument per line and has no escaping, so a
// newline in the password injects qpdf arguments. Moving the password off argv
// to fix an information leak is what created this vector; these pin it shut.
for (const [name, pw] of [['LF', 'a\n--decrypt'], ['CR', 'a\r--decrypt'], ['CRLF', 'a\r\n--decrypt']]) {
  Deno.test({
    name: `protectPdf - refuses a password containing ${name}`,
    ignore: !READY,
    async fn() {
      const dir = await Deno.makeTempDir({ prefix: 'protect-' });
      const plain = await renderPdf(doc, dir);
      await assertRejects(() => protectPdf(plain, pw, dir), Error, 'line separator');
      await Deno.remove(dir, { recursive: true });
    },
  });
}

Deno.test({
  name: 'protectPdf - leaves no decrypted PDF behind when it refuses',
  ignore: !READY,
  async fn() {
    const dir = await Deno.makeTempDir({ prefix: 'protect-' });
    const plain = await renderPdf(doc, dir);
    await assertRejects(() => protectPdf(plain, 'a\n--decrypt', dir));
    for (const entry of Deno.readDirSync(dir)) {
      assert(entry.name !== 'plain.pdf', 'the decrypted PDF was left in the working directory');
      assert(!entry.name.startsWith('qpdf.'), 'an argument file was left behind');
    }
    await Deno.remove(dir, { recursive: true });
  },
});
