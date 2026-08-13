/**
 * Typst rendering.
 *
 * These need `typst` and `pdftotext`, which exist on the render box but not on
 * a developer laptop or in CI. Rather than fail there, they SKIP when the tools
 * are absent -- and say so, because a silently-skipped test is indistinguishable
 * from a passing one and that is how coverage quietly disappears.
 *
 * Run where the tools are: deno test --allow-read --allow-write --allow-run romania/
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { renderPdf } from '../render.ts';

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

const HAVE_TYPST = await have('typst');
const HAVE_PDFTOTEXT = await have('pdftotext');
if (!HAVE_TYPST) console.warn('[render_test] typst absent - render tests SKIPPED');

const doc = {
  entries: [
    {
      index: 0,
      tamilNumeral: '௧',
      tamil: 'முழுமையான சந்தோஷம்ன்னா உனக்கு என்ன?',
      transliteration: 'Muḻumaiyāṉa cantōṣamṉṉā uṉakku eṉṉa?',
      english: 'What is your idea of perfect happiness?',
      answer: 'Sitting in the garden at dusk.',
      skipped: false,
    },
    {
      index: 1,
      tamilNumeral: '௨',
      tamil: 'உன்னோட ரொம்பப் பெரிய பயம் என்ன?',
      transliteration: 'Uṉṉōṭa rompap periya payam eṉṉa?',
      english: 'What is your greatest fear?',
      answer: '',
      skipped: true,
    },
  ],
};

async function extract(pdf: Uint8Array): Promise<string> {
  const child = new Deno.Command('pdftotext', {
    args: ['-', '-'],
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'null',
  }).spawn();
  const w = child.stdin.getWriter();
  await w.write(pdf);
  await w.close();
  const out = await child.output();
  return new TextDecoder().decode(out.stdout);
}

Deno.test({
  name: 'renderPdf - produces a real PDF',
  ignore: !HAVE_TYPST,
  async fn() {
    const dir = await Deno.makeTempDir({ prefix: 'render-test-' });
    const pdf = await renderPdf(doc, dir);
    assertEquals(new TextDecoder().decode(pdf.slice(0, 5)), '%PDF-');
    assert(pdf.length > 1000, 'a two-question document should not be trivially small');
    await Deno.remove(dir, { recursive: true });
  },
});

Deno.test({
  name: 'renderPdf - leaves no plaintext in the working directory',
  ignore: !HAVE_TYPST,
  async fn() {
    const dir = await Deno.makeTempDir({ prefix: 'render-test-' });
    await renderPdf(doc, dir);
    // data.json holds the fully decrypted questionnaire. If it survives the
    // call, every later reader of that directory can read the answers.
    assertEquals([...Deno.readDirSync(dir)].length, 0, 'working directory must be empty afterwards');
    await Deno.remove(dir, { recursive: true });
  },
});

Deno.test({
  name: 'renderPdf - Tamil shapes rather than rendering as tofu',
  ignore: !(HAVE_TYPST && HAVE_PDFTOTEXT),
  async fn() {
    const dir = await Deno.makeTempDir({ prefix: 'render-test-' });
    const text = await extract(await renderPdf(doc, dir));
    // Any Tamil codepoint surviving extraction means the glyphs were shaped
    // from the font rather than dropped to .notdef boxes.
    assert(/[஀-௿]/.test(text), 'no Tamil codepoints in the output - the font is missing or not shaping');
    await Deno.remove(dir, { recursive: true });
  },
});

Deno.test({
  name: 'renderPdf - a skipped question still appears',
  ignore: !(HAVE_TYPST && HAVE_PDFTOTEXT),
  async fn() {
    const dir = await Deno.makeTempDir({ prefix: 'render-test-' });
    const text = await extract(await renderPdf(doc, dir));
    assert(text.includes('greatest fear'), 'skipped questions must not be omitted');
    assert(text.includes('unanswered'), 'a skipped question must be marked, not left blank');
    await Deno.remove(dir, { recursive: true });
  },
});

Deno.test({
  name: 'renderPdf - carries the site furniture on the page',
  ignore: !(HAVE_TYPST && HAVE_PDFTOTEXT),
  async fn() {
    const dir = await Deno.makeTempDir({ prefix: 'render-test-' });
    const text = await extract(await renderPdf(doc, dir));
    assert(text.includes('a formulation of truth'), 'title, lowercase');
    assert(!text.includes('A FORMULATION OF TRUTH'), 'title must not be uppercase');
    assert(text.includes('aformulationoftruth.com'), 'domain, lower left');
    await Deno.remove(dir, { recursive: true });
  },
});
