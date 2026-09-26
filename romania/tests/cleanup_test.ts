/**
 * Plaintext cleanup on every failure path.
 *
 * The system's core invariant: decrypted answers exist only in memory-backed
 * storage, only during one request. These tests verify that intermediate files
 * are removed even when render, protect, or mail fails.
 *
 * Run: deno test --allow-read --allow-write --allow-run --allow-env --allow-net romania/tests/cleanup_test.ts
 *
 * No test here reaches typst or SMTP: both are replaced by a fake runner that
 * fails at a chosen point, so the failure paths run everywhere and nothing is
 * ever mailed.
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
//
// Typst is replaced by a runner that fails on purpose, so the failure path is
// exercised on every machine -- typst installed or not -- and cannot quietly
// turn into a success-path test if typst happens to accept the input.

import { renderPdf } from '../render.ts';
import { ageFixture, dirContents as contents, fakeRunner, TEST_EMAIL } from './fixtures.ts';

Deno.test('renderPdf - a failed typst run removes data.json and the template', async () => {
  const dir = await tmp();
  let sawPlaintext = false;
  const { run, calls } = fakeRunner({
    typst: async () => {
      // The decrypted data must exist, owner-only, while typst runs...
      const info = await Deno.stat(`${dir}/data.json`);
      sawPlaintext = info.isFile && (info.mode! & 0o777) === 0o600;
      return false; // ...and then the render fails.
    },
  });
  await assertRejects(() => renderPdf({ entries: [] }, dir, run), Error, 'typst render failed');
  assertEquals(calls.length, 1, 'typst must have been invoked');
  assert(sawPlaintext, 'data.json must exist, 0600, while typst runs');
  assertEquals(contents(dir), [], 'data.json must not survive a failed render');
  await Deno.remove(dir, { recursive: true });
});

// ── sendDelivery cleanup ─────────────────────────────────────────────
//
// python3 is replaced too. The test must never reach SMTP: on the key box
// FROM_EMAIL is set, and the old version of this test handed a real spec to
// send_mail.py.

import { sendDelivery } from '../mailer.ts';

async function withFromEmail<T>(fn: () => Promise<T>): Promise<T> {
  const saved = Deno.env.get('FROM_EMAIL');
  Deno.env.set('FROM_EMAIL', 'sender@example.invalid');
  try {
    return await fn();
  } finally {
    if (saved === undefined) Deno.env.delete('FROM_EMAIL');
    else Deno.env.set('FROM_EMAIL', saved);
  }
}

Deno.test('sendDelivery - a failed send removes both the spec and the pdf', async () => {
  const dir = await tmp();
  let seen: string[] = [];
  const { run, calls } = fakeRunner({
    python3: () => {
      // Both files exist while the sender runs; the failure comes after.
      seen = contents(dir);
      return false;
    },
  });
  await withFromEmail(() =>
    assertRejects(
      () =>
        sendDelivery({
          to: TEST_EMAIL,
          pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
          filename: 'test.pdf',
          protected: false,
          workDir: dir,
        }, run),
      Error,
      'smtp send failed',
    )
  );
  assertEquals(calls.length, 1, 'the sender must have been invoked exactly once');
  assertEquals(seen, ['mail.json', 'outgoing.pdf'], 'the failure must come after both files exist');
  assertEquals(contents(dir), [], 'neither file may survive a failed send');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('sendDelivery - without SMTP configured, fails before writing anything', async () => {
  const dir = await tmp();
  const saved = [Deno.env.get('FROM_EMAIL'), Deno.env.get('SMTP_USER')];
  Deno.env.delete('FROM_EMAIL');
  Deno.env.delete('SMTP_USER');
  const { run, calls } = fakeRunner({});
  try {
    await assertRejects(
      () =>
        sendDelivery(
          { to: TEST_EMAIL, pdf: new Uint8Array([0x25]), filename: 't.pdf', protected: false, workDir: dir },
          run,
        ),
      Error,
      'SMTP not configured',
    );
  } finally {
    if (saved[0] !== undefined) Deno.env.set('FROM_EMAIL', saved[0]);
    if (saved[1] !== undefined) Deno.env.set('SMTP_USER', saved[1]);
  }
  assertEquals(calls.length, 0);
  assertEquals(contents(dir), []);
  await Deno.remove(dir, { recursive: true });
});

// ── handleBundle: the real delivery path, failing at a chosen tool ───
//
// Real age decryption, the real DeliveryRunner and receipt, and the real
// work-directory cleanup -- only typst and python3 are replaced.

import { makeHandleBundle } from '../render-service.ts';
import { DeliveryError, DeliveryRunner } from '../delivery.ts';
import { storeIdentity } from '../keystore.ts';

const KEY_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SESSION = 'c3ecba99477a562d99bfdf92023aa3173934383197d6d6f8b1184224016d60cf';
const SECRET_ANSWER = 'a cabin in Montana with good light for reading';

async function deliveryFixture() {
  const [keyDir, workRoot, receipts] = await Promise.all([tmp(), tmp(), tmp()]);
  const age = await ageFixture();
  await storeIdentity(keyDir, KEY_ID, age.identity);
  const bundle = {
    sessionId: SESSION,
    keyId: KEY_ID,
    deliveryId: crypto.randomUUID(),
    answers: [
      {
        questionIndex: 0,
        questionText: 'Your idea of perfect happiness?',
        ciphertext: await age.encrypt(SECRET_ANSWER),
        skipped: false,
      },
      { questionIndex: 1, questionText: 'Your greatest fear?', ciphertext: '', skipped: true },
    ],
    encryptedEmail: await age.encrypt(TEST_EMAIL),
    encryptedPassword: null,
  };
  let confirmed = 0;
  const handle = (run: ReturnType<typeof fakeRunner>['run']) =>
    makeHandleBundle({
      keyDir,
      workRoot,
      runner: new DeliveryRunner(receipts),
      confirm: () => {
        confirmed++;
        return Promise.resolve();
      },
      run,
    });
  const cleanupAll = () => Promise.all([keyDir, workRoot, receipts].map((d) => Deno.remove(d, { recursive: true })));
  return { keyDir, workRoot, receipts, bundle, handle, confirmed: () => confirmed, cleanupAll };
}

/** Fake typst that checks the decrypted answer reached data.json, then writes a PDF. */
function typstThatSees(onData: (plaintext: string) => void, succeed: boolean) {
  return async (args: string[]) => {
    const root = args[args.indexOf('--root') + 1];
    onData(await Deno.readTextFile(`${root}/data.json`));
    if (succeed) await Deno.writeFile(args[args.length - 1], new TextEncoder().encode('%PDF-1.4\n'));
    return succeed;
  };
}

Deno.test('handleBundle - a failed render removes the work directory and writes no receipt', async () => {
  const f = await deliveryFixture();
  let data = '';
  const { run } = fakeRunner({ typst: typstThatSees((d) => (data = d), false) });

  const err = await assertRejects(() => f.handle(run)(f.bundle), DeliveryError);
  assertEquals(err.stage, 'render');
  assert(data.includes(SECRET_ANSWER), 'the answer must have been decrypted into the work directory');
  assertEquals(contents(f.workRoot), [], 'the work directory must be gone');
  assertEquals(contents(f.receipts), [], 'a pre-SMTP failure leaves no receipt, so it can be retried');
  assertEquals(f.confirmed(), 0);
  await f.cleanupAll();
});

Deno.test('handleBundle - a failed send removes the work directory and records an uncertain receipt', async () => {
  const f = await deliveryFixture();
  let data = '';
  let spec: Record<string, unknown> = {};
  let specMode = 0;
  const { run, calls } = fakeRunner({
    typst: typstThatSees((d) => (data = d), true),
    python3: async (args) => {
      specMode = (await Deno.stat(args[1])).mode! & 0o777;
      spec = JSON.parse(await Deno.readTextFile(args[1]));
      return false;
    },
  });

  const err = await withFromEmail(() => assertRejects(() => f.handle(run)(f.bundle), DeliveryError));
  assertEquals(err.stage, 'smtp');
  assert(data.includes(SECRET_ANSWER));
  assertEquals(spec.to, TEST_EMAIL, 'the decrypted address goes in the spec file');
  assertEquals(specMode, 0o600, 'the spec file holds the address and must be owner-only');
  const sender = calls.find((c) => c.command === 'python3')!;
  assert(!sender.args.some((a) => a.includes(TEST_EMAIL)), 'the address must never be on argv');
  assertEquals(contents(f.workRoot), [], 'the work directory must be gone');
  // SMTP may have accepted the message before failing, so the receipt stays
  // "sending" and a retry is refused rather than risking a second email.
  const receipt = JSON.parse(await Deno.readTextFile(`${f.receipts}/${f.bundle.deliveryId}.json`));
  assertEquals(receipt.state, 'sending');
  assertEquals(f.confirmed(), 0);
  await f.cleanupAll();
});
