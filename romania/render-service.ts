/**
 * The key box render service.
 *
 * Receives a bundle of ciphertext from the web tier, decrypts it with the
 * session identity held here and nowhere else, typesets a PDF, optionally
 * protects it with the respondent's password, mails it, and tells the web tier
 * it was delivered.
 *
 * This is the only process in the system that ever sees a respondent's answers
 * in the clear, and it holds them for the duration of one request. Everything
 * about it is arranged around keeping that window short and its floor
 * memory-backed.
 */

import { armor, Decrypter } from 'jsr:@age/age-encryption@^0.3.0';
import { loadIdentity, markDelivered } from './keystore.ts';
import { type RenderEntry, renderPdf } from './render.ts';
import { protectPdf } from './protect.ts';
import { sendDelivery } from './mailer.ts';
import { type Runner, runQuiet } from './subprocess.ts';
import { type Bundle, DeliveryError, DeliveryRunner } from './delivery.ts';

const BIND = Deno.env.get('RENDER_BIND') || '127.0.0.1';
const PORT = parseInt(Deno.env.get('RENDER_PORT') || '8791', 10);
const TOKEN = Deno.env.get('RENDER_TOKEN') || '';
const KEY_DIR = Deno.env.get('KEYBOX_KEY_DIR') || '/home/liar/keybox';
/**
 * Where the plaintext lives for the duration of one request.
 *
 * /tmp, NOT /dev/shm. Deno treats /dev/shm as a special path and refuses every
 * operation there without --allow-all ("Requires all access to ..."), which
 * would mean running this service unsandboxed to gain a tmpfs it already has:
 * /tmp is tmpfs here, and the unit sets PrivateTmp=true, so the service gets a
 * private, memory-backed /tmp no other process can see. Better on both counts.
 */
const WORK_ROOT = Deno.env.get('RENDER_WORK_ROOT') || '/tmp';
const CALLBACK_URL = Deno.env.get('RENDER_CALLBACK_URL') || '';
const CALLBACK_TOKEN = Deno.env.get('RENDER_CALLBACK_TOKEN') || '';
const runner = new DeliveryRunner(Deno.env.get('RENDER_RECEIPT_DIR') || '/var/lib/a4t-render/receipts');
const startedAt = new Date().toISOString();
const failures: Record<string, Record<string, number>> = {};

function recordFailure(stage: string) {
  const day = new Date().toISOString().slice(0, 10);
  const counts = failures[day] ??= {};
  counts[stage] = (counts[stage] || 0) + 1;
  for (const key of Object.keys(failures).sort().slice(0, -2)) delete failures[key];
}

const SESSION_ID = /^[0-9a-fA-F-]{8,64}$/;

type DeliveryBundle = Bundle;

/** Canonical questionnaire length; the bundle must be complete. */
const CANONICAL_COUNT = 35;

/**
 * Structural check before anything is decrypted.
 *
 * Re-validated here even though the web tier already did it: bundles arrive
 * over the network, and a short or reordered one would render as a
 * plausible-looking but wrong document that the respondent has no way to
 * detect.
 */
export function validateBundle(b: unknown): 'ok' | string {
  const bundle = b as DeliveryBundle;
  if (!bundle || typeof bundle !== 'object') return 'not an object';
  if (typeof bundle.sessionId !== 'string' || !SESSION_ID.test(bundle.sessionId)) return 'bad session id';
  if (bundle.keyId !== undefined && (typeof bundle.keyId !== 'string' || !SESSION_ID.test(bundle.keyId))) {
    return 'bad key id';
  }
  if (typeof bundle.deliveryId !== 'string' || !/^[0-9a-f-]{36}$/.test(bundle.deliveryId)) return 'bad delivery id';
  if (!Array.isArray(bundle.answers)) return 'answers missing';
  if (bundle.answers.length !== CANONICAL_COUNT) return `expected ${CANONICAL_COUNT} answers`;
  for (let i = 0; i < CANONICAL_COUNT; i++) {
    if (bundle.answers[i]?.questionIndex !== i) return `answer ${i} out of order`;
    const a = bundle.answers[i];
    if (typeof a.questionText !== 'string' || typeof a.ciphertext !== 'string' || typeof a.skipped !== 'boolean') {
      return 'bad answer';
    }
  }
  if (typeof bundle.encryptedEmail !== 'string' || bundle.encryptedEmail.length === 0) return 'address missing';
  if (bundle.encryptedPassword !== null && typeof bundle.encryptedPassword !== 'string') return 'bad password';
  return 'ok';
}

async function decryptWith(identity: string, ciphertext: string): Promise<string> {
  const d = new Decrypter();
  d.addIdentity(identity);
  return await d.decrypt(armor.decode(ciphertext), 'text');
}

/**
 * Turn a bundle into the document, deliver it, and report back.
 *
 * The working directory is created under WORK_ROOT (tmpfs) and removed in a
 * `finally`, so a failure anywhere does not leave the decrypted questionnaire
 * on the floor.
 */
async function prepareBundle(
  bundle: DeliveryBundle,
  work: string,
  keyDir: string,
  run: Runner,
): Promise<() => Promise<void>> {
  let identity: string;
  try {
    identity = await loadIdentity(keyDir, bundle.keyId || bundle.sessionId);
  } catch (e) {
    throw new DeliveryError('identity', e instanceof Deno.errors.NotFound ? 410 : 503);
  }
  // NOT Deno.makeTempDir({ dir }): that demands blanket filesystem access
  // (NotCapable: "Requires all access to /dev/shm") even with --allow-read and
  // --allow-write granted, which would force the service to run --allow-all.
  // Creating the directory ourselves needs only write permission, so the
  // sandbox stays narrow.
  await Deno.mkdir(work, { recursive: false, mode: 0o700 });
  let stage = 'decrypt';
  try {
    const address = await decryptWith(identity, bundle.encryptedEmail);

    const password = bundle.encryptedPassword ? await decryptWith(identity, bundle.encryptedPassword) : null;

    // Synthesized gap-fillers carry an empty ciphertext. Handing that to age
    // would fail the whole render over a question the respondent never
    // reached, so skipped entries are never decrypted.
    const entries: RenderEntry[] = await Promise.all(bundle.answers.map(async (a) => ({
      index: a.questionIndex,
      tamilNumeral: TAMIL_NUMERALS[a.questionIndex] ?? String(a.questionIndex + 1),
      tamil: '',
      transliteration: '',
      english: a.questionText,
      answer: a.skipped || a.ciphertext === '' ? '' : await decryptWith(identity, a.ciphertext),
      skipped: a.skipped || a.ciphertext === '',
    })));

    stage = 'render';
    let pdf = await renderPdf({ entries }, work, run);
    stage = 'protect';
    if (password) pdf = await protectPdf(pdf, password, work);
    return () =>
      sendDelivery({
        to: address,
        pdf,
        filename: 'responses.pdf',
        protected: Boolean(password),
        workDir: work,
      }, run);
  } catch {
    throw new DeliveryError(stage, stage === 'decrypt' ? 422 : 503);
  }
}

export interface HandlerDeps {
  keyDir: string;
  workRoot: string;
  runner: DeliveryRunner;
  confirm: (sessionId: string) => Promise<void>;
  /** External tools (typst, python3 for SMTP). Defaults to runQuiet. */
  run?: Runner;
}

/**
 * Built from its dependencies so tests can drive the real delivery path --
 * decryption, the runner and its receipt, and the work-directory cleanup --
 * with temporary directories and a runner that fails at a chosen tool, instead
 * of re-enacting the cleanup pattern by hand. Production uses the defaults
 * below.
 */
export function makeHandleBundle(deps: HandlerDeps): (bundle: DeliveryBundle) => Promise<void> {
  const run = deps.run ?? runQuiet;
  return async (bundle) => {
    const work = `${deps.workRoot}/render-${crypto.randomUUID()}`;
    await deps.runner.run(bundle, {
      prepare: (b) => prepareBundle(b, work, deps.keyDir, run),
      mark: (keyId, at) => markDelivered(deps.keyDir, keyId, at),
      confirm: deps.confirm,
      cleanup: () => Deno.remove(work, { recursive: true }),
    });
  };
}

export const handleBundle = makeHandleBundle({
  keyDir: KEY_DIR,
  workRoot: WORK_ROOT,
  runner,
  confirm: notifyDelivered,
});

/** Tell the web tier the copy went, so it can stamp pdf_delivered_at. */
async function notifyDelivered(sessionId: string): Promise<void> {
  if (!CALLBACK_URL || !CALLBACK_TOKEN) throw new DeliveryError('callback');
  try {
    const res = await fetch(`${CALLBACK_URL}/delivered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CALLBACK_TOKEN}` },
      body: JSON.stringify({ sessionId }),
      signal: AbortSignal.timeout(15_000),
    });
    await res.body?.cancel();
    // A rejected callback used to be indistinguishable from an accepted one.
    // For months every call 404'd -- the route did not exist -- and nothing
    // said so, so pdf_delivered_at was never stamped and the shred clock never
    // started. The status is not PII; not checking it is how that hid.
    if (!res.ok) throw new DeliveryError('callback');
  } catch {
    // The document is already in the respondent's hands; a failed callback
    // means a stale pdf_delivered_at, not a lost delivery.
    throw new DeliveryError('callback');
  }
}

const TAMIL_NUMERALS = [
  '௧',
  '௨',
  '௩',
  '௪',
  '௫',
  '௬',
  '௭',
  '௮',
  '௯',
  '௰',
  '௰௧',
  '௰௨',
  '௰௩',
  '௰௪',
  '௰௫',
  '௰௬',
  '௰௭',
  '௰௮',
  '௰௯',
  '௨௰',
  '௨௰௧',
  '௨௰௨',
  '௨௰௩',
  '௨௰௪',
  '௨௰௫',
  '௨௰௬',
  '௨௰௭',
  '௨௰௮',
  '௨௰௯',
  '௩௰',
  '௩௰௧',
  '௩௰௨',
  '௩௰௩',
  '௩௰௪',
  '௩௰௫',
];

if (import.meta.main) {
  if (!TOKEN) {
    console.error('[render] RENDER_TOKEN not set; refusing to start');
    Deno.exit(1);
  }

  Deno.serve({ hostname: BIND, port: PORT }, async (req) => {
    if (req.method === 'GET' && new URL(req.url).pathname === '/health') {
      if (req.headers.get('Authorization') !== `Bearer ${TOKEN}`) return new Response('unauthorized', { status: 401 });
      return Response.json({ ok: true, startedAt, failures }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (req.method !== 'POST' || new URL(req.url).pathname !== '/render') {
      return new Response('not found', { status: 404 });
    }
    if (req.headers.get('Authorization') !== `Bearer ${TOKEN}`) {
      return new Response('unauthorized', { status: 401 });
    }

    let bundle: DeliveryBundle;
    try {
      bundle = await req.json();
    } catch {
      return new Response('bad request', { status: 400 });
    }

    const verdict = validateBundle(bundle);
    if (verdict !== 'ok') {
      // The reason is safe to return: it describes shape, never content.
      recordFailure('validation');
      return new Response(verdict, { status: 400, headers: { 'X-Delivery-Stage': 'validation' } });
    }

    try {
      await handleBundle(bundle);
      return new Response('ok', { status: 200 });
    } catch (exc) {
      // The MESSAGE is withheld -- it can carry answer text or the address --
      // but the exception CLASS cannot, and without it a failure is undiagnosable.
      const stage = exc instanceof DeliveryError ? exc.stage : 'render';
      recordFailure(stage);
      console.error('[render] delivery failed stage=%s', stage);
      return new Response('delivery failed', {
        status: exc instanceof DeliveryError ? exc.status : 503,
        headers: { 'X-Delivery-Stage': stage },
      });
    }
  });
}
