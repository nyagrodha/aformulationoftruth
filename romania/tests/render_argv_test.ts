/**
 * Typst argv and cleanup contract.
 *
 * romania/tests/render_test.ts skips whenever typst is absent, which is every
 * CI machine. The properties that must not regress — answers off argv, stderr
 * discarded, plaintext removed on failure — do not need typst at all.
 *
 *   deno test --allow-read --allow-write romania/tests/render_argv_test.ts
 */

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { renderPdf } from '../render.ts';

const CANARY = 'Sitting in the garden at dusk with a secret.';

const doc = {
  entries: [
    {
      index: 0,
      tamilNumeral: '௧',
      tamil: 'கேள்வி',
      transliteration: 'kēḷvi',
      english: 'What is your idea of perfect happiness?',
      answer: CANARY,
      skipped: false,
    },
  ],
};

const src = await Deno.readTextFile(new URL('../render.ts', import.meta.url));

Deno.test('renderPdf argv is only compile, --root, template, and output', () => {
  assert(
    src.includes("args: ['compile', '--root', workDir, typPath, outPath]"),
    'typst must be invoked with paths, never the document',
  );
});

Deno.test('the decrypted questionnaire is not on argv', () => {
  const command = src.slice(src.indexOf('new Deno.Command'));
  const argsBlock = command.slice(command.indexOf('args:'), command.indexOf(']'));
  assertEquals(argsBlock.includes('JSON.stringify'), false, 'the document must not appear in argv');
  assertEquals(argsBlock.includes('doc.'), false, 'answer fields must not appear in argv');
  assertEquals(argsBlock.includes('--input'), false, 'typst --input would put JSON on cmdline');
  assert(
    src.includes('JSON.stringify(doc)'),
    'the document must still be written to the 0600 data file',
  );
});

Deno.test('typst stderr is discarded so a failed render cannot echo answers', () => {
  const command = src.slice(src.indexOf("new Deno.Command('typst'"));
  assert(
    command.includes("stderr: 'null'"),
    'Typst echoes source context on failure, which for this template is answer text',
  );
});

Deno.test('data.json is written 0600 and removed in finally', () => {
  assert(src.includes("{ mode: 0o600 }"), 'the decrypted JSON must not be group/world readable');
  assert(src.includes('finally {'), 'cleanup must run on every path, including throws');
  const finallyBlock = src.slice(src.indexOf('finally {'));
  assert(finallyBlock.includes('dataPath'), 'data.json must be removed after a failed render too');
});

Deno.test({
  name: 'renderPdf - a failed typst leaves no plaintext in the working directory',
  async fn() {
    const orig = Deno.Command;
    let captured: { bin: string; args: string[] } | undefined;

    // deno-lint-ignore no-explicit-any
    (Deno as any).Command = class {
      constructor(bin: string, opts: { args: string[] }) {
        captured = { bin, args: opts.args };
      }
      output() {
        return Promise.resolve({
          success: false,
          code: 1,
          stdout: new Uint8Array(),
          stderr: new TextEncoder().encode(`error: unknown variable: ${CANARY}`),
        });
      }
    };

    const dir = await Deno.makeTempDir({ prefix: 'render-argv-' });
    try {
      await assertRejects(() => renderPdf(doc, dir), Error, 'typst render failed');
      assertEquals([...Deno.readDirSync(dir)].length, 0, 'working directory must be empty afterwards');
      assertEquals(captured?.bin, 'typst');
      const argv = captured?.args.join(' ') ?? '';
      assert(!argv.includes(CANARY), 'the answer must not appear on argv');
      assert(!argv.includes('data.json'), 'typst must not be pointed at the JSON as an input flag');
      assertEquals(captured?.args[0], 'compile');
      assertEquals(captured?.args[1], '--root');
    } finally {
      // deno-lint-ignore no-explicit-any
      (Deno as any).Command = orig;
      await Deno.remove(dir, { recursive: true });
    }
  },
});
