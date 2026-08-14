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

const BIND = Deno.env.get('RENDER_BIND') || '127.0.0.1';
const PORT = parseInt(Deno.env.get('RENDER_PORT') || '8791', 10);
const TOKEN = Deno.env.get('RENDER_TOKEN') || '';
const KEY_DIR = Deno.env.get('KEYBOX_KEY_DIR') || '/home/liar/keybox';
/** tmpfs in production: plaintext must never reach persistent storage. */
const WORK_ROOT = Deno.env.get('RENDER_WORK_ROOT') || '/dev/shm';
const CALLBACK_URL = Deno.env.get('RENDER_CALLBACK_URL') || '';
const CALLBACK_TOKEN = Deno.env.get('RENDER_CALLBACK_TOKEN') || '';

const SESSION_ID = /^[0-9a-fA-F-]{8,64}$/;

interface BundleAnswer {
  questionIndex: number;
  questionText: string;
  ciphertext: string;
  skipped: boolean;
}

interface DeliveryBundle {
  sessionId: string;
  answers: BundleAnswer[];
  encryptedEmail: string;
  encryptedPassword: string | null;
}

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
  if (!Array.isArray(bundle.answers)) return 'answers missing';
  if (bundle.answers.length !== CANONICAL_COUNT) return `expected ${CANONICAL_COUNT} answers`;
  for (let i = 0; i < CANONICAL_COUNT; i++) {
    if (bundle.answers[i]?.questionIndex !== i) return `answer ${i} out of order`;
  }
  if (typeof bundle.encryptedEmail !== 'string' || bundle.encryptedEmail.length === 0) return 'address missing';
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
export async function handleBundle(bundle: DeliveryBundle): Promise<void> {
  const identity = await loadIdentity(KEY_DIR, bundle.sessionId);
  const work = await Deno.makeTempDir({ dir: WORK_ROOT, prefix: 'render-' });

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

    let pdf = await renderPdf({ entries }, work);
    if (password) pdf = await protectPdf(pdf, password, work);

    await sendDelivery({
      to: address,
      pdf,
      filename: 'responses.pdf',
      protected: Boolean(password),
    });

    // Only after the send succeeded. Recording a delivery that did not happen
    // would start the shred clock on a key still needed.
    await markDelivered(KEY_DIR, bundle.sessionId, new Date());
    await notifyDelivered(bundle.sessionId);
  } finally {
    await Deno.remove(work, { recursive: true }).catch(() => {});
  }
}

/** Tell the web tier the copy went, so it can stamp pdf_delivered_at. */
async function notifyDelivered(sessionId: string): Promise<void> {
  if (!CALLBACK_URL) return;
  try {
    const res = await fetch(`${CALLBACK_URL}/delivered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CALLBACK_TOKEN}` },
      body: JSON.stringify({ sessionId }),
      signal: AbortSignal.timeout(15_000),
    });
    await res.body?.cancel();
  } catch {
    // The document is already in the respondent's hands; a failed callback
    // means a stale pdf_delivered_at, not a lost delivery.
    console.error('[render] delivery callback failed');
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
      return new Response(verdict, { status: 400 });
    }

    try {
      await handleBundle(bundle);
      return new Response('ok', { status: 200 });
    } catch {
      // Category only. The thrown error can carry answer text or the address.
      console.error('[render] delivery failed');
      return new Response('render failed', { status: 500 });
    }
  });
}
