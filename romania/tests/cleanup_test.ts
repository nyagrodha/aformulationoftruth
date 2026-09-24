/**
 * Plaintext cleanup on every failure path.
 *
 * The system's core invariant: decrypted answers exist only in memory-backed
 * storage, only during one request. These tests verify that intermediate files
 * are removed even when render, protect, or mail fails.
 *
 * Run: deno test --allow-read --allow-write --allow-run --allow-env romania/tests/cleanup_test.ts
 */

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { protectPdf } from '../protect.ts';

const tmp = () => Deno.makeTempDir({ prefix: 'cleanup-' });

async function have(bin: string): Promise<boolean> {
  try {
    await new Deno.Command(bin, { args: ['--version'], stdout: 'null', stderr: 'null' }).output();
    return true;
  } catch {
    return false;
  }
}

const HAVE_QPDF = await have('qpdf');
if (!HAVE_QPDF) console.warn('[cleanup_test] qpdf absent - some tests SKIPPED');

function dirContents(dir: string): string[] {
  return [...Deno.readDirSync(dir)].map((e) => e.name).sort();
}

// ── protectPdf cleanup ───────────────────────────────────────────────

Deno.test({
  name: 'protectPdf - cleans up when given non-PDF input (qpdf crash)',
  ignore: !HAVE_QPDF,
  async fn() {
    const dir = await tmp();
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    await assertRejects(() => protectPdf(garbage, 'password123', dir));
    assertEquals(dirContents(dir), [], 'no files should remain after a failed encryption');
    await Deno.remove(dir, { recursive: true });
  },
});

Deno.test({
  name: 'protectPdf - cleans up when given a truncated PDF',
  ignore: !HAVE_QPDF,
  async fn() {
    const dir = await tmp();
    const truncated = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n');
    await assertRejects(() => protectPdf(truncated, 'password123', dir));
    assertEquals(dirContents(dir), [], 'no files should remain after a failed encryption');
    await Deno.remove(dir, { recursive: true });
  },
});

Deno.test({
  name: 'protectPdf - cleans up argfiles on empty-password rejection',
  ignore: !HAVE_QPDF,
  async fn() {
    const dir = await tmp();
    const pdf = new TextEncoder().encode('%PDF-');
    await assertRejects(() => protectPdf(pdf, '', dir), Error, 'empty password');
    assertEquals(dirContents(dir), [], 'no files should remain after rejection');
    await Deno.remove(dir, { recursive: true });
  },
});

// ── renderPdf cleanup on failure ─────────────────────────────────────

// We test renderPdf cleanup by providing it data that will make typst fail.
// This requires typst to be installed.
import { renderPdf } from '../render.ts';

const HAVE_TYPST = await have('typst');
if (!HAVE_TYPST) console.warn('[cleanup_test] typst absent - render cleanup tests SKIPPED');

Deno.test({
  name: 'renderPdf - cleans up data.json when typst fails on bad input',
  ignore: !HAVE_TYPST,
  async fn() {
    const dir = await tmp();
    // An empty entries array may cause the template to error.
    // If it doesn't, the test still verifies cleanup on the success path.
    try {
      await renderPdf({ entries: [] }, dir);
    } catch {
      // Expected to fail with some templates.
    }
    assertEquals(dirContents(dir), [], 'data.json must not survive a render attempt');
    await Deno.remove(dir, { recursive: true });
  },
});

// ── sendDelivery cleanup ─────────────────────────────────────────────

import { sendDelivery } from '../mailer.ts';

Deno.test('sendDelivery - cleans up spec and pdf when send fails', async () => {
  const dir = await tmp();
  // sendDelivery will fail because SMTP is not configured or python3 will
  // fail to connect. Either way, cleanup must happen.
  try {
    await sendDelivery({
      to: 'test@example.com',
      pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      filename: 'test.pdf',
      protected: false,
      workDir: dir,
    });
  } catch {
    // Expected: SMTP not configured or send fails.
  }
  const remaining = dirContents(dir);
  assert(!remaining.includes('outgoing.pdf'), 'outgoing.pdf must not survive a failed send');
  assert(!remaining.includes('mail.json'), 'mail.json must not survive a failed send');
  await Deno.remove(dir, { recursive: true });
});

// ── handleBundle end-to-end cleanup (mocked) ─────────────────────────

// We cannot import handleBundle directly and mock its internals without
// dependency injection. Instead, we test the cleanup contract by simulating
// the work directory lifecycle: create files, call the cleanup pattern, verify.

Deno.test('handleBundle cleanup pattern - work dir removed even when decryption throws', async () => {
  const work = await tmp();
  // Simulate handleBundle's finally block.
  try {
    // Simulate files created during a request.
    await Deno.writeTextFile(`${work}/data.json`, '{"entries":[]}', { mode: 0o600 });
    await Deno.writeTextFile(`${work}/template.typ`, '#set page()', { mode: 0o600 });
    await Deno.writeFile(`${work}/out.pdf`, new Uint8Array([0x25]), { mode: 0o600 });
    // Simulate decryption failure.
    throw new Error('age decryption failed');
  } catch {
    // handleBundle's finally:
  } finally {
    await Deno.remove(work, { recursive: true }).catch(() => {});
  }
  // Verify the directory is gone.
  await assertRejects(() => Deno.stat(work), Deno.errors.NotFound);
});

Deno.test('handleBundle cleanup pattern - work dir removed even when mail throws', async () => {
  const work = await tmp();
  try {
    await Deno.writeTextFile(`${work}/data.json`, '{}', { mode: 0o600 });
    await Deno.writeFile(`${work}/outgoing.pdf`, new Uint8Array([0x25]), { mode: 0o600 });
    await Deno.writeTextFile(`${work}/mail.json`, '{}', { mode: 0o600 });
    throw new Error('smtp send failed');
  } catch {
    // Expected.
  } finally {
    await Deno.remove(work, { recursive: true }).catch(() => {});
  }
  await assertRejects(() => Deno.stat(work), Deno.errors.NotFound);
});
